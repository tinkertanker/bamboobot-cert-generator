/** @jest-environment node */

const addToQueue = jest.fn(async () => undefined);
jest.mock('@/lib/email/email-queue', () => ({
  EmailQueueManager: jest.fn(() => ({
    addToQueue,
    isProcessing: jest.fn(() => true),
    processQueue: jest.fn(),
    getQueueLength: jest.fn(() => 0),
    getStatus: jest.fn(() => ({ status: 'idle' })),
    getLastActivity: jest.fn(() => Date.now()),
    clear: jest.fn(),
  })),
}));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })),
}));
jest.mock('@/lib/email/provider-factory', () => ({
  getEmailProvider: jest.fn(() => ({ name: 'resend' })),
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async () => ({ allowed: true, limit: 100, current: 2 })),
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(() => ({ allowed: true })),
}));
jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(async () => undefined),
}));

import httpMocks from 'node-mocks-http';
import handler, { cleanupEmailQueueInterval } from '@/pages/api/send-bulk-email';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { reserveEmailUsage } from '@/lib/server/tiers';

const mockReserveEmailUsage = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;

describe('bulk email quota and content controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });
  afterAll(() => cleanupEmailQueueInterval());
  afterEach(() => delete process.env.FILE_URL_SIGNING_SECRET);

  it('counts actual recipients and ignores client-supplied HTML', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [{
          to: 'one@example.com,two@example.com',
          subject: 'Attacker subject',
          html: '<a href="https://evil.example">phish</a>',
          certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
        }],
        config: { senderName: 'Trainer', subject: 'Certificate', message: '<b>Hello</b>' },
        sessionId: 'email-session-test',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockReserveEmailUsage).toHaveBeenCalledWith('u1', 2);
    const queued = addToQueue.mock.calls[0][0][0];
    expect(queued.subject).toBe('Certificate');
    expect(queued.html).toContain('&lt;b&gt;Hello&lt;/b&gt;');
    expect(queued.html).not.toContain('evil.example');
  });

  it('does not enqueue when quota reservation is denied', async () => {
    mockReserveEmailUsage.mockResolvedValueOnce({ allowed: false, limit: 0, current: 0 });
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [{
          to: 'victim@example.com',
          certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
        }],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-denied',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('does not treat malformed empty attachment data as trusted link delivery', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        emails: [{
          to: 'victim@example.com',
          attachmentData: {},
          certificateUrl: 'https://evil.example/phish',
        }],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-empty-attachment',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it('enforces the recipient cap cumulatively across deferred batches', async () => {
    const recipients = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => `user${start + index}@example.com`).join(',');
    const firstEmails = Array.from({ length: 50 }, (_, index) => ({
      to: recipients(index * 10, 10),
      certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
    }));
    const first = httpMocks.createMocks({
      method: 'POST',
      body: {
        emails: firstEmails,
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-recipient-cap',
        deferProcessing: true,
      },
    });
    await handler(first.req, first.res);
    expect(first.res.statusCode).toBe(200);

    const overflow = httpMocks.createMocks({
      method: 'POST',
      body: {
        emails: [{
          to: 'overflow@example.com',
          certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
        }],
        config: { senderName: 'Trainer', subject: 'Certificate', message: 'Hello' },
        sessionId: 'email-session-recipient-cap',
        deferProcessing: true,
      },
    });
    await handler(overflow.req, overflow.res);

    expect(overflow.res.statusCode).toBe(413);
    expect(addToQueue).toHaveBeenCalledTimes(1);
  });
});
