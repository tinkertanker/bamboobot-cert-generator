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
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 1000, current: 0 })),
  reserveEmailUsage: jest.fn(async () => ({
    allowed: true,
    limit: 1000,
    current: 2,
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
import { releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { callEmailQueue } from '@/lib/email/queue-client';
import { installCloudflareEnv, resetCloudflareEnv } from '../helpers/cloudflare';
import { createMockProvider, createQueueHarness, type QueueHarness } from '../helpers/email-queue-harness';
import { silenceConsole } from '../helpers/silence-console';

const mockReserveEmailUsage = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;
const mockReleaseEmailUsage = releaseEmailUsageReservation as jest.MockedFunction<typeof releaseEmailUsageReservation>;
const mockCallEmailQueue = callEmailQueue as jest.MockedFunction<typeof callEmailQueue>;
const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
let harness: QueueHarness;
let provider: ReturnType<typeof createMockProvider>;
let selfFetch: jest.Mock;

async function queuedTotal(sessionId: string) {
  const response = await harness.callEmailQueue('u1', `/status?sessionId=${sessionId}`);
  return ((await response.json()) as { total: number }).total;
}

describe('bulk email quota and content controls', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    process.env.NEXTAUTH_SECRET = 'quota-test-secret';
    const { bucket } = installCloudflareEnv();
    selfFetch = jest.fn(async () => new Response('{"success":true}'));
    harness = createQueueHarness({ FILES: bucket, WORKER_SELF_REFERENCE: { fetch: selfFetch } } as never);
    mockCallEmailQueue.mockImplementation(harness.callEmailQueue);
    provider = createMockProvider();
    mockGetEmailProvider.mockReturnValue(provider as never);
  });
  afterEach(() => {
    resetCloudflareEnv();
    delete process.env.NEXTAUTH_SECRET;
  });

  it('coalesces terminal definitely-unsent bulk refunds by reservation day', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [
          { to: 'one@example.com', certificateUrl: createSignedGeneratedFileUrl('u_u1/one.pdf') },
          { to: 'two@example.com', certificateUrl: createSignedGeneratedFileUrl('u_u1/two.pdf') }
        ],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-refund'
      }
    });
    const res = httpMocks.createResponse();

    provider.sendEmail.mockResolvedValue({
      id: '',
      success: false,
      error: 'PROVIDER_REJECTED: identity not verified',
      provider: 'resend'
    } as never);

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    await harness.drain('u1');

    // Both rejections are refunded together through the internal route.
    const refundCalls = selfFetch.mock.calls.filter(([url]) => String(url).endsWith('/email-quota-refund'));
    expect(refundCalls).toHaveLength(1);
    expect(JSON.parse(refundCalls[0][1].body)).toEqual({
      userId: 'u1',
      refunds: [{ reservationDay: '2026-07-11T00:00:00.000Z', recipientCount: 2 }]
    });
    // The route itself only returns quota for emails it failed to queue.
    expect(mockReleaseEmailUsage).not.toHaveBeenCalled();
  });
  afterAll(() => delete process.env.FILE_URL_SIGNING_SECRET);

  it('counts actual recipients and ignores client-supplied HTML', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'one@example.com,two@example.com',
            subject: 'Attacker subject',
            html: '<a href="https://evil.example">phish</a>',
            certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf')
          }
        ],
        config: { senderName: 'Trainer', subject: 'Certificate', message: '<b>Hello</b>' },
        sessionId: 'email-session-test'
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockReserveEmailUsage).toHaveBeenCalledWith('u1', 2);
    await harness.drain('u1');
    const queued = provider.sendEmail.mock.calls[0][0] as unknown as { subject: string; html: string };
    expect(queued.subject).toBe('Certificate');
    expect(queued.html).toContain('&lt;b&gt;Hello&lt;/b&gt;');
    expect(queued.html).not.toContain('evil.example');
  });

  it('does not enqueue when quota reservation is denied', async () => {
    mockReserveEmailUsage.mockResolvedValueOnce({ allowed: false, limit: 0, current: 0 });
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'victim@example.com',
            certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf')
          }
        ],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-denied'
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(await queuedTotal('email-session-denied')).toBe(0);
    expect(mockCallEmailQueue).not.toHaveBeenCalledWith('u1', '/enqueue', expect.anything());
  });

  it('does not expose unexpected bulk queue diagnostics', async () => {
    mockReserveEmailUsage.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.8:5432'));
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [{ to: 'victim@example.com', certificateUrl: createSignedGeneratedFileUrl('u_u1/error.pdf') }],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-internal-error'
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Failed to queue emails', code: 'EMAIL_QUEUE_ERROR' });
    expect(res._getData()).not.toContain('10.0.0.8');
  });

  it('does not treat malformed empty attachment data as trusted link delivery', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'victim@example.com',
            attachmentData: {},
            certificateUrl: 'https://evil.example/phish'
          }
        ],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-empty-attachment'
      }
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(await queuedTotal('email-session-empty-attachment')).toBe(0);
  });

  it('enforces the recipient cap cumulatively across deferred batches', async () => {
    const recipients = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => `user${start + index}@example.com`).join(',');
    const firstEmails = Array.from({ length: 50 }, (_, index) => ({
      to: recipients(index * 10, 10),
      certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf')
    }));
    const first = httpMocks.createMocks({
      method: 'POST',
      body: {
        emails: firstEmails,
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-recipient-cap',
        deferProcessing: true
      }
    });
    await handler(first.req, first.res);
    expect(first.res.statusCode).toBe(200);

    const overflow = httpMocks.createMocks({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'overflow@example.com',
            certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf')
          }
        ],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-recipient-cap',
        deferProcessing: true
      }
    });
    await handler(overflow.req, overflow.res);

    expect(overflow.res.statusCode).toBe(413);
    expect(await queuedTotal('email-session-recipient-cap')).toBe(50);
    expect(mockReleaseEmailUsage).toHaveBeenCalledWith('u1', 1, new Date('2026-07-11T00:00:00Z'));
  });
});
