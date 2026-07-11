/** @jest-environment node */

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1', email: 'owner@example.com' } })),
}));
jest.mock('@/lib/email/provider-factory', () => ({
  getEmailProvider: jest.fn(),
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async () => ({ allowed: true, limit: 100, current: 1 })),
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(() => ({ allowed: true })),
}));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/send-test-email';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { reserveEmailUsage } from '@/lib/server/tiers';
import { getEmailProvider } from '@/lib/email/provider-factory';

const mockSendEmail = jest.fn(async () => ({ success: true, id: 'email-1', provider: 'resend' }));
const mockReserveEmailUsage = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;
const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;

describe('test email abuse controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEmailProvider.mockReturnValue({ sendEmail: mockSendEmail } as any);
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });

  afterEach(() => delete process.env.FILE_URL_SIGNING_SECRET);

  it('only permits the authenticated account email', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        testEmailAddress: 'victim@example.com',
        subject: 'Certificate',
        customMessage: 'Hello',
        deliveryMethod: 'download',
        certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockReserveEmailUsage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('builds safe server-side content and reserves one recipient', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        testEmailAddress: 'OWNER@example.com',
        senderName: 'Trainer',
        subject: 'Certificate',
        customMessage: '<img src=x onerror=alert(1)>',
        deliveryMethod: 'download',
        certificateUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
        html: '<a href="https://evil.example">phish</a>',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockReserveEmailUsage).toHaveBeenCalledWith('u1', 1);
    const params = mockSendEmail.mock.calls[0][0];
    expect(params.html).toContain('&lt;img');
    expect(params.html).not.toContain('evil.example');
  });

  it('rejects requested attachment delivery when no PDF is built', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        testEmailAddress: 'owner@example.com',
        senderName: 'Trainer',
        subject: 'Certificate',
        customMessage: 'Hello',
        attachmentData: {},
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockReserveEmailUsage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
