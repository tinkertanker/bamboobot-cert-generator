import { createMocks } from 'node-mocks-http';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { buildPdfAttachments } from '../../utils/email-utils';
import handler from '@/pages/api/send-bulk-email';

const mockAddToQueue = jest.fn();

jest.mock('@/lib/email/email-queue', () => ({
  EmailQueueManager: jest.fn(() => ({
    addToQueue: mockAddToQueue,
    isProcessing: jest.fn(() => true),
    processQueue: jest.fn(),
    getQueueLength: jest.fn(() => 0),
    getStatus: jest.fn(() => ({ status: 'idle' })),
    getLastActivity: jest.fn(() => Date.now())
  }))
}));

jest.mock('@/lib/email/provider-factory');
jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn()
}));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } }))
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(() => ({ allowed: true }))
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async (_userId: string, count: number) => ({
    allowed: true, limit: 100, current: count
  }))
}));
jest.mock('../../utils/email-utils', () => {
  const actual = jest.requireActual('../../utils/email-utils');
  return { ...actual, buildPdfAttachments: jest.fn() };
});

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
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockedGetEmailProvider.mockReturnValue({
      name: 'resend',
      sendEmail: jest.fn(),
      getRateLimit: jest.fn(),
      isConfigured: jest.fn(() => true)
    } as any);
    mockAddToQueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('limits attachment construction concurrency to four emails', async () => {
    let active = 0;
    let peak = 0;
    mockedBuildPdfAttachments.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
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
    expect(mockAddToQueue).not.toHaveBeenCalled();
  });

  it('enforces the attachment budget across deferred requests', async () => {
    process.env.MAX_BULK_EMAIL_ATTACHMENT_BYTES = '20';
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
    expect(mockAddToQueue).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent requests against the session attachment budget', async () => {
    process.env.MAX_BULK_EMAIL_ATTACHMENT_BYTES = '20';
    mockedBuildPdfAttachments.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
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
    expect(mockAddToQueue).toHaveBeenCalledTimes(1);
  });

  it('rejects more than 500 emails before loading attachments', async () => {
    const { req, res } = requestFor(
      Array.from({ length: 501 }, (_, index) => email(index)),
      'count-test'
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(413);
    expect(mockedBuildPdfAttachments).not.toHaveBeenCalled();
  });
});
