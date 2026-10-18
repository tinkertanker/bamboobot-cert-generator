/** @jest-environment node */

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  }
}));
jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
jest.mock('@/lib/email/provider-factory', () => ({ getEmailProvider: jest.fn() }));
jest.mock('@/lib/email/queue-client', () => ({ callEmailQueue: jest.fn() }));
jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn()
}));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } }))
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 1000, current: 0 })),
  reserveEmailUsage: jest.fn(async (_userId: string, count: number) => ({
    allowed: true,
    limit: 1000,
    current: count,
    reservationDay: new Date('2026-07-11T00:00:00Z')
  })),
  releaseEmailUsageReservation: jest.fn(async () => undefined)
}));
jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(async () => undefined)
}));

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/send-bulk-email';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { callEmailQueue } from '@/lib/email/queue-client';
import { requireAuth } from '@/lib/auth/requireAuth';
import { releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';
import { createMockProvider, createQueueHarness, type QueueHarness } from '../helpers/email-queue-harness';
import { silenceConsole } from '../helpers/silence-console';

const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
const mockCallEmailQueue = callEmailQueue as jest.MockedFunction<typeof callEmailQueue>;
const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockRelease = releaseEmailUsageReservation as jest.MockedFunction<typeof releaseEmailUsageReservation>;
const mockReserve = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;
const certificateUrl = createSignedGeneratedFileUrl('u_u1/test/certificate.pdf');
const config = { senderName: 'Test Sender', subject: 'Test Subject', message: 'Test message' };

let bucket: FakeR2Bucket;
let harness: QueueHarness;
let provider: ReturnType<typeof createMockProvider>;

function post(body: Record<string, unknown>) {
  return createMocks({ method: 'POST', body: { config, ...body } });
}

async function call(mocks: ReturnType<typeof createMocks>) {
  await handler(mocks.req as unknown as NextApiRequest, mocks.res as unknown as NextApiResponse);
  return { status: mocks.res._getStatusCode(), body: JSON.parse(mocks.res._getData() || '{}') };
}

describe('/api/send-bulk-email', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    ({ bucket } = installCloudflareEnv());
    harness = createQueueHarness({
      FILES: bucket,
      WORKER_SELF_REFERENCE: { fetch: jest.fn(async () => new Response('{}')) }
    } as never);
    mockCallEmailQueue.mockImplementation(harness.callEmailQueue);
    provider = createMockProvider();
    mockGetEmailProvider.mockReturnValue(provider as never);
  });

  afterEach(() => resetCloudflareEnv());

  it('queues emails in the user’s queue object, which sends them from its alarm', async () => {
    const result = await call(
      post({ emails: [{ to: 'test@example.com', certificateUrl }], sessionId: 'test-session' })
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, queueLength: 1, skippedCount: 0 });
    expect(mockReserve).toHaveBeenCalledWith('u1', 1);
    expect(markGeneratedFileAsEmailed).toHaveBeenCalledWith(certificateUrl, 'u1');

    await harness.drain('u1');
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['test@example.com'], subject: 'Test Subject' })
    );
    expect((provider.sendEmail.mock.calls[0][0] as unknown as { html: string }).html).toContain(
      'Download'
    );
  });

  it('stores attachments in R2 under the user’s queue prefix and removes them once sent', async () => {
    const pdf = Buffer.from('%PDF-1.4 bulk').toString('base64');
    const result = await call(
      post({
        emails: [{ to: 'a@example.com', attachmentData: { data: pdf, filename: 'Ada.pdf' } }],
        sessionId: 'attachment-session'
      })
    );
    expect(result.status).toBe(200);
    const keys = [...bucket.objects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^email_queue\/u_u1\/attachment-session\/[^/]+\/0\.pdf$/);

    await harness.drain('u1');
    const sent = provider.sendEmail.mock.calls[0][0] as unknown as {
      attachments: Array<{ filename: string; content: Buffer }>;
    };
    expect(sent.attachments[0].filename).toBe('Ada.pdf');
    expect(sent.attachments[0].content.toString()).toBe('%PDF-1.4 bulk');
    expect(bucket.objects.size).toBe(0);
  });

  it('defers queue processing until the final batch is started', async () => {
    for (const to of ['first@example.com', 'second@example.com']) {
      const result = await call(
        post({ emails: [{ to, certificateUrl }], sessionId: 'deferred-batches', deferProcessing: true })
      );
      expect(result.status).toBe(200);
    }
    await harness.drain('u1');
    expect(provider.sendEmail).not.toHaveBeenCalled();

    const start = await call(
      createMocks({ method: 'PUT', body: { action: 'start', sessionId: 'deferred-batches' } })
    );
    expect(start.status).toBe(200);
    await harness.drain('u1');
    expect(provider.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('enforces the 500-email cap across deferred batches and returns the reservation', async () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ to: `user${index}@example.com`, certificateUrl }));
    expect((await call(post({ emails: many, sessionId: 'cap', deferProcessing: true }))).status).toBe(200);

    const overflow = await call(
      post({ emails: [{ to: 'extra@example.com', certificateUrl }], sessionId: 'cap', deferProcessing: true })
    );

    expect(overflow.status).toBe(413);
    expect(mockRelease).toHaveBeenCalledWith('u1', 1, new Date('2026-07-11T00:00:00Z'));
    const status = await call(createMocks({ method: 'GET', query: { sessionId: 'cap' } }));
    expect(status.body).toMatchObject({ total: 500 });
  });

  it('rejects a single request with more than 500 emails before reserving quota', async () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ to: `user${index}@example.com`, certificateUrl }));
    const result = await call(post({ emails: many, sessionId: 'too-many' }));
    expect(result.status).toBe(413);
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockCallEmailQueue).not.toHaveBeenCalled();
  });

  it('keeps returning the terminal status of a completed queue', async () => {
    await call(post({ emails: [{ to: 'done@example.com', certificateUrl }], sessionId: 'completed-session' }));
    await harness.drain('u1');

    for (let attempt = 0; attempt < 2; attempt++) {
      const status = await call(createMocks({ method: 'GET', query: { sessionId: 'completed-session' } }));
      expect(status.body).toMatchObject({ status: 'completed', processed: 1, total: 1 });
    }
  });

  it('preserves all valid recipients from a mixed recipient cell', async () => {
    const result = await call(
      post({
        emails: [{ to: 'first@example.com, invalid, second@example.com', certificateUrl }],
        sessionId: 'mixed-recipient-session'
      })
    );
    expect(result.status).toBe(200);
    expect(mockReserve).toHaveBeenCalledWith('u1', 2);
    await harness.drain('u1');
    expect(provider.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['first@example.com', 'second@example.com'] })
    );
  });

  it('skips entries with no valid address and rejects requests where none remain', async () => {
    const mixed = await call(
      post({
        emails: [
          { to: 'invalid', certificateUrl },
          { to: 'ok@example.com', certificateUrl }
        ],
        sessionId: 'skip-session'
      })
    );
    expect(mixed.body).toMatchObject({ success: true, skippedCount: 1, queueLength: 1 });

    const none = await call(post({ emails: [{ to: 'invalid', certificateUrl }], sessionId: 'none-session' }));
    expect(none.status).toBe(400);
  });

  it('does not expose or control another user’s queue with the same session id', async () => {
    await call(
      post({ emails: [{ to: 'owner@example.com', certificateUrl }], sessionId: 'shared-session', deferProcessing: true })
    );

    mockedRequireAuth.mockResolvedValueOnce({ user: { id: 'u2' } } as Awaited<ReturnType<typeof requireAuth>>);
    const get = await call(createMocks({ method: 'GET', query: { sessionId: 'shared-session' } }));
    mockedRequireAuth.mockResolvedValueOnce({ user: { id: 'u2' } } as Awaited<ReturnType<typeof requireAuth>>);
    const put = await call(createMocks({ method: 'PUT', body: { action: 'cancel', sessionId: 'shared-session' } }));

    expect(get.body).toMatchObject({ status: 'idle', total: 0 });
    expect(put.status).toBe(404);
    expect(mockCallEmailQueue).toHaveBeenCalledWith('u2', expect.any(String), expect.anything());
    const owner = await call(createMocks({ method: 'GET', query: { sessionId: 'shared-session' } }));
    expect(owner.body).toMatchObject({ total: 1 });
  });

  it('pauses a queue', async () => {
    await call(post({ emails: [{ to: 'test@example.com', certificateUrl }], sessionId: 'pause-session' }));

    const pause = await call(createMocks({ method: 'PUT', body: { action: 'pause', sessionId: 'pause-session' } }));

    expect(pause.status).toBe(200);
    expect(pause.body.success).toBe(true);
    await harness.drain('u1');
    expect(provider.sendEmail).not.toHaveBeenCalled();
    const status = await call(createMocks({ method: 'GET', query: { sessionId: 'pause-session' } }));
    expect(status.body).toMatchObject({ status: 'paused' });
  });

  it('rejects invalid control actions without calling the queue', async () => {
    const result = await call(createMocks({ method: 'PUT', body: { action: 'explode', sessionId: 's1' } }));
    expect(result.status).toBe(400);
    expect(mockCallEmailQueue).not.toHaveBeenCalled();
  });

  it('rejects unbounded or attacker-shaped session IDs on every method', async () => {
    const bad = '../'.repeat(100);
    expect((await call(post({ emails: [{ to: 'a@example.com', certificateUrl }], sessionId: bad }))).status).toBe(400);
    expect((await call(createMocks({ method: 'GET', query: { sessionId: bad } }))).status).toBe(400);
    expect((await call(createMocks({ method: 'PUT', body: { action: 'pause', sessionId: bad } }))).status).toBe(400);
    expect(mockCallEmailQueue).not.toHaveBeenCalled();
  });

  it('returns 500 when no email provider is configured', async () => {
    mockGetEmailProvider.mockImplementation(() => {
      throw new Error('none');
    });
    const result = await call(post({ emails: [{ to: 'a@example.com', certificateUrl }], sessionId: 'no-provider' }));
    expect(result.status).toBe(500);
    expect(result.body.error).toMatch(/No email provider configured/);
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it('should return 405 for unsupported methods', async () => {
    const result = await call(createMocks({ method: 'DELETE' }));
    expect(result.status).toBe(405);
    expect(result.body.error).toBe('Method not allowed');
  });

  it('should return 400 for missing emails', async () => {
    const result = await call(post({ emails: [], sessionId: 'test-session' }));
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('No emails provided');
  });

  it('should return 400 for incomplete config', async () => {
    const result = await call(
      createMocks({
        method: 'POST',
        body: { emails: [{ to: 'test@example.com' }], config: { senderName: 'Test' }, sessionId: 'test-session' }
      })
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Email configuration incomplete');
  });
});
