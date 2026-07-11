/** @jest-environment node */

const addToQueue = jest.fn(async () => undefined);
jest.mock('@/lib/email/email-queue', () => ({
  EmailQueueManager: jest.fn(() => ({
    addToQueue,
    isProcessing: jest.fn(() => true),
    processQueue: jest.fn(),
    getQueueLength: jest.fn(() => 0),
    getRetainedAttachmentBytes: jest.fn(() => 0),
    onItemCompleted: jest.fn(),
    getStatus: jest.fn(() => ({ status: 'idle' })),
    getLastActivity: jest.fn(() => Date.now()),
    clear: jest.fn()
  }))
}));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } }))
}));
jest.mock('@/lib/email/provider-factory', () => ({
  getEmailProvider: jest.fn(() => ({ name: 'resend' }))
}));
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
  enforceRateLimit: jest.fn(() => ({ allowed: true }))
}));
jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(async () => undefined)
}));

import httpMocks from 'node-mocks-http';
import handler, { cleanupEmailQueueInterval } from '@/pages/api/send-bulk-email';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

const config = {
  senderName: 'Trainer',
  subject: 'Certificate',
  message: 'Hello'
};

describe('bulk email queue resource controls', () => {
  beforeAll(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });
  afterAll(() => {
    cleanupEmailQueueInterval();
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
    expect(addToQueue).not.toHaveBeenCalled();
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
    expect(addToQueue).not.toHaveBeenCalled();
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

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const firstQueue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    firstQueue.getStatus.mockReturnValue({
      status: 'completed',
      processed: 1,
      failed: 0,
      total: 1,
      remaining: 0
    });
    const replacementRes = httpMocks.createResponse();
    await handler(request('replacement-queue'), replacementRes);

    expect(replacementRes.statusCode).toBe(200);
    expect(firstQueue.clear).toHaveBeenCalledTimes(1);
  });
});
