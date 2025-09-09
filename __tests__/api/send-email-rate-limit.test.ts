import { createMocks } from 'node-mocks-http';

jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));

// Mock provider to avoid real email sending
jest.mock('@/lib/email/provider-factory', () => ({
  getEmailProvider: () => ({
    sendEmail: async () => ({ success: true, id: 'id123', provider: 'resend' })
  })
}));

describe('send-email API rate limiting', () => {
  it('returns 429 after exceeding email limit', async () => {
    jest.resetModules();
    process.env.RATE_LIMIT_WINDOW_SECONDS = '1';
    process.env.RATE_LIMIT_EMAIL_PER_MIN = '2';

    const { default: handler } = await import('@/pages/api/send-email');

    const makeReqRes = () => createMocks({
      method: 'POST',
      headers: { 'x-real-ip': '127.0.0.1' },
      body: {
        to: 'x@y.com',
        subject: 'Hi',
        senderName: 'T',
        customMessage: 'm',
        deliveryMethod: 'download',
        downloadUrl: 'https://example.com/cert.pdf'
      }
    });

    // First two allowed
    let { req, res } = makeReqRes();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    ({ req, res } = makeReqRes());
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    // Third should be rate-limited
    ({ req, res } = makeReqRes());
    await handler(req, res);
    expect(res._getStatusCode()).toBe(429);
  });
});

