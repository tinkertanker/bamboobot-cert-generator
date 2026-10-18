/** @jest-environment node */

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  }
}));
jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
jest.mock('@/lib/email/queue-client', () => ({ callEmailQueue: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } }))
}));
jest.mock('@/lib/email/provider-factory', () => ({ getEmailProvider: jest.fn() }));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({
    allowed: true,
    limit: 1000,
    current: 0
  })),
  reserveEmailUsage: jest.fn(async () => ({
    allowed: true,
    limit: 1000,
    current: 1,
    reservationDay: new Date('2026-07-11T00:00:00Z')
  })),
  releaseEmailUsageReservation: jest.fn(async () => undefined)
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true }))
}));
jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(async () => undefined)
}));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/send-bulk-email';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { callEmailQueue } from '@/lib/email/queue-client';
import { releaseEmailUsageReservation } from '@/lib/server/tiers';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';
import { createMockProvider, createQueueHarness, type QueueHarness } from '../helpers/email-queue-harness';
import { silenceConsole } from '../helpers/silence-console';

const mockCallEmailQueue = callEmailQueue as jest.MockedFunction<typeof callEmailQueue>;
const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
const mockRelease = releaseEmailUsageReservation as jest.MockedFunction<typeof releaseEmailUsageReservation>;
let harness: QueueHarness;
let bucket: FakeR2Bucket;

const config = {
  senderName: 'Trainer',
  subject: 'Certificate',
  message: 'Hello'
};

describe('bulk email queue resource controls', () => {
  silenceConsole();

  beforeAll(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });
  beforeEach(() => {
    jest.clearAllMocks();
    ({ bucket } = installCloudflareEnv());
    harness = createQueueHarness({
      FILES: bucket,
      WORKER_SELF_REFERENCE: { fetch: jest.fn(async () => new Response('{}')) }
    } as never);
    mockCallEmailQueue.mockImplementation(harness.callEmailQueue);
    mockGetEmailProvider.mockReturnValue(createMockProvider() as never);
  });
  afterEach(() => resetCloudflareEnv());
  afterAll(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    delete process.env.MAX_ACTIVE_EMAIL_QUEUES_PER_USER;
    delete process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER;
  });

  it('rejects unbounded or attacker-shaped session IDs', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [{ to: 'owner@example.com' }],
        config,
        sessionId: '../'.repeat(100)
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockCallEmailQueue).not.toHaveBeenCalled();
  });

  it('bounds retained attachment bytes per account', async () => {
    process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER = '5';
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'owner@example.com',
            attachmentData: {
              data: Buffer.from('%PDF-test').toString('base64'),
              filename: 'certificate.pdf'
            }
          }
        ],
        config,
        sessionId: 'attachment-pressure',
        deferProcessing: true
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(413);
    const status = await harness.callEmailQueue('u1', '/status?sessionId=attachment-pressure');
    expect(await status.json()).toMatchObject({ total: 0 });
    // The rejected attachment is not left in storage and its quota is returned.
    expect(bucket.objects.size).toBe(0);
    expect(mockRelease).toHaveBeenCalledWith('u1', 1, new Date('2026-07-11T00:00:00Z'));
    delete process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER;
  });

  it('bounds active queues per account', async () => {
    process.env.MAX_ACTIVE_EMAIL_QUEUES_PER_USER = '1';
    const certificateUrl = createSignedGeneratedFileUrl('u_u1/certificate.pdf');
    const request = (sessionId: string) =>
      httpMocks.createRequest({
        method: 'POST',
        body: {
          emails: [{ to: 'owner@example.com', certificateUrl }],
          config,
          sessionId,
          deferProcessing: true
        }
      });
    const firstRes = httpMocks.createResponse();
    await handler(request('first-queue'), firstRes);
    expect(firstRes.statusCode).toBe(200);

    const secondRes = httpMocks.createResponse();
    await handler(request('second-queue'), secondRes);

    expect(secondRes.statusCode).toBe(429);
    expect(mockRelease).toHaveBeenCalledTimes(1);

    // Once the first queue has been sent it no longer counts as active.
    await harness.callEmailQueue('u1', '/control', {
      method: 'POST',
      body: { sessionId: 'first-queue', action: 'start' }
    });
    await harness.drain('u1');
    const replacementRes = httpMocks.createResponse();
    await handler(request('replacement-queue'), replacementRes);

    expect(replacementRes.statusCode).toBe(200);
    delete process.env.MAX_ACTIVE_EMAIL_QUEUES_PER_USER;
  });
});
