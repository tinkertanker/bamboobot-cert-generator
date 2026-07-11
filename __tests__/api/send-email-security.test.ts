/** @jest-environment node */

jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {} }));
jest.mock('@/lib/server/middleware/featureGate', () => ({
  withFeatureGate: (_options: unknown, handler: any) => async (req: any, res: any) => {
    req.user = { id: 'u1', email: 'owner@example.com', tier: 'plus' };
    return handler(req, res);
  },
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async () => ({ allowed: true, limit: 100, current: 2 })),
}));
jest.mock('@/lib/email/provider-factory', () => ({
  getEmailProvider: jest.fn(),
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(() => ({ allowed: true })),
}));
jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(async () => undefined),
}));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/send-email';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { reserveEmailUsage } from '@/lib/server/tiers';
import { getEmailProvider } from '@/lib/email/provider-factory';

const mockSendEmail = jest.fn(async () => ({ success: true, id: 'email-1', provider: 'resend' }));
const mockReserveEmailUsage = reserveEmailUsage as jest.MockedFunction<typeof reserveEmailUsage>;
const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;

describe('single email abuse controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEmailProvider.mockReturnValue({ sendEmail: mockSendEmail } as any);
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });
  afterEach(() => delete process.env.FILE_URL_SIGNING_SECRET);

  it('reserves quota for every deduplicated recipient', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        to: 'one@example.com,two@example.com,ONE@example.com',
        subject: 'Certificate',
        senderName: 'Trainer',
        customMessage: 'Hello',
        deliveryMethod: 'download',
        downloadUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockReserveEmailUsage).toHaveBeenCalledWith('u1', 2);
    expect(mockSendEmail.mock.calls[0][0].to).toEqual(['one@example.com', 'two@example.com']);
  });

  it('rejects arbitrary link delivery before reserving quota or sending', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        to: 'victim@example.com',
        subject: 'Click here',
        customMessage: 'Hello',
        deliveryMethod: 'download',
        downloadUrl: 'https://evil.example/phish',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(mockReserveEmailUsage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rejects display names that could be parsed as an address list', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        to: 'victim@example.com',
        subject: 'Certificate',
        senderName: 'attacker@example.com,',
        customMessage: 'Hello',
        deliveryMethod: 'download',
        downloadUrl: createSignedGeneratedFileUrl('u_u1/certificate.pdf'),
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockReserveEmailUsage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rejects attachment delivery without a built certificate', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        to: 'victim@example.com',
        subject: 'Certificate',
        senderName: 'Trainer',
        customMessage: 'Hello',
        deliveryMethod: 'attachment',
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockReserveEmailUsage).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
