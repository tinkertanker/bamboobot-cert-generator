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
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true }))
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async (_userId: string, count: number) => ({
    allowed: true,
    limit: 100,
    current: count,
    reservationDay: new Date('2026-07-11T00:00:00Z')
  })),
  releaseEmailUsageReservation: jest.fn(async () => undefined)
}));
jest.mock('../../utils/email-utils', () => {
  const actual = jest.requireActual('../../utils/email-utils');
  return { ...actual, buildPdfAttachments: jest.fn() };
});

import { createMocks } from 'node-mocks-http';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { callEmailQueue } from '@/lib/email/queue-client';
import { releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import { buildPdfAttachments } from '../../utils/email-utils';
import handler from '@/pages/api/send-bulk-email';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';
import { createMockProvider, createQueueHarness, type QueueHarness } from '../helpers/email-queue-harness';
import { silenceConsole } from '../helpers/silence-console';

const mockCallEmailQueue = callEmailQueue as jest.MockedFunction<typeof callEmailQueue>;
const mockRelease = releaseEmailUsageReservation as jest.MockedFunction<typeof releaseEmailUsageReservation>;
const mockReserve = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;
let bucket: FakeR2Bucket;
let harness: QueueHarness;

/** Emails currently held by the user's queue object, across sessions. */
async function queuedTotal(sessionId: string) {
  const response = await harness.callEmailQueue('u1', `/status?sessionId=${sessionId}`);
  return ((await response.json()) as { total: number }).total;
}

const mockedGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
const mockedBuildPdfAttachments = buildPdfAttachments as jest.MockedFunction<typeof buildPdfAttachments>;
const originalEnv = process.env;

function email(index: number) {
  return {
    to: `recipient${index}@example.com`,
    senderName: 'Sender',
    subject: 'Certificate',
    html: '<p>Attached</p>',
    attachments: [
      {
        path: `https://certs.example.com/generated/${index}.pdf`,
        filename: `${index}.pdf`
      }
    ]
  };
}

function requestFor(emails: ReturnType<typeof email>[], sessionId: string) {
  return createMocks({
    method: 'POST',
    body: {
      emails,
      config: {
        senderName: 'Sender',
        subject: 'Certificate',
        message: 'Attached'
      },
      sessionId
    }
  });
}

describe('/api/send-bulk-email attachment resource limits', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    ({ bucket } = installCloudflareEnv());
    harness = createQueueHarness({
      FILES: bucket,
      WORKER_SELF_REFERENCE: { fetch: jest.fn(async () => new Response('{}')) }
    } as never);
    mockCallEmailQueue.mockImplementation(harness.callEmailQueue);
    mockedGetEmailProvider.mockReturnValue(createMockProvider() as never);
  });

  afterEach(() => {
    process.env = originalEnv;
    resetCloudflareEnv();
  });

  it('releases the upload slot when a request fails before queueing', async () => {
    process.env.MAX_CONCURRENT_EMAIL_INGESTIONS_PER_USER = '1';
    mockedBuildPdfAttachments.mockRejectedValue(new Error('storage down'));
    for (let attempt = 0; attempt < 2; attempt++) {
      const { req, res } = requestFor([email(attempt)], `slot-test-${attempt}`);
      await handler(req, res);
      // A leaked lease would turn the second attempt into a 429.
      expect(res._getStatusCode()).toBe(500);
    }
  });

  it('limits attachment construction concurrency to four emails', async () => {
    let active = 0;
    let peak = 0;
    mockedBuildPdfAttachments.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return [
        {
          filename: 'certificate.pdf',
          content: Buffer.from('%PDF-1.4\nsmall'),
          contentType: 'application/pdf'
        }
      ];
    });
    const { req, res } = requestFor(
      Array.from({ length: 8 }, (_, index) => email(index)),
      'concurrency-test'
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockedBuildPdfAttachments).toHaveBeenCalledTimes(8);
    expect(peak).toBe(4);
  });

  it('rejects a batch that exceeds the request-wide attachment budget', async () => {
    process.env.MAX_BULK_EMAIL_ATTACHMENT_BYTES = '20';
    mockedBuildPdfAttachments.mockResolvedValue([
      {
        filename: 'certificate.pdf',
        content: Buffer.from('%PDF-123456789'),
        contentType: 'application/pdf'
      }
    ]);
    const { req, res } = requestFor([email(1), email(2)], 'aggregate-test');

    await handler(req, res);

    expect(res._getStatusCode()).toBe(413);
    expect(mockReserve).not.toHaveBeenCalled();
    expect(await queuedTotal('aggregate-test')).toBe(0);
    // Attachments already written for the rejected request are removed.
    expect(bucket.objects.size).toBe(0);
  });

  it('enforces the per-account retained attachment budget across requests', async () => {
    process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER = '20';
    mockedBuildPdfAttachments.mockResolvedValue([
      {
        filename: 'certificate.pdf',
        content: Buffer.from('%PDF-123456789'),
        contentType: 'application/pdf'
      }
    ]);
    const first = requestFor([email(1)], 'deferred-budget-test');
    first.req.body.deferProcessing = true;
    await handler(first.req, first.res);

    const second = requestFor([email(2)], 'deferred-budget-test');
    await handler(second.req, second.res);

    expect(first.res._getStatusCode()).toBe(200);
    expect(second.res._getStatusCode()).toBe(413);
    expect(await queuedTotal('deferred-budget-test')).toBe(1);
    // The rejected request's quota and stored attachment are given back.
    expect(mockRelease).toHaveBeenCalledWith('u1', 1, new Date('2026-07-11T00:00:00Z'));
    expect(bucket.objects.size).toBe(1);
  });

  it('serialises concurrent requests against the retained attachment budget', async () => {
    process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER = '20';
    mockedBuildPdfAttachments.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return [
        {
          filename: 'certificate.pdf',
          content: Buffer.from('%PDF-123456789'),
          contentType: 'application/pdf'
        }
      ];
    });
    const first = requestFor([email(1)], 'concurrent-budget-test');
    const second = requestFor([email(2)], 'concurrent-budget-test');
    first.req.body.deferProcessing = true;
    second.req.body.deferProcessing = true;

    await Promise.all([handler(first.req, first.res), handler(second.req, second.res)]);

    expect([first.res._getStatusCode(), second.res._getStatusCode()].sort()).toEqual([200, 413]);
    expect(await queuedTotal('concurrent-budget-test')).toBe(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('rejects more than 500 emails before loading attachments', async () => {
    const { req, res } = requestFor(
      Array.from({ length: 501 }, (_, index) => email(index)),
      'count-test'
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(413);
    expect(mockedBuildPdfAttachments).not.toHaveBeenCalled();
    expect(mockCallEmailQueue).not.toHaveBeenCalled();
  });
});
