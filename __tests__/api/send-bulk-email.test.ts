import { createMocks } from 'node-mocks-http';

// Mock EmailQueueManager
jest.mock('@/lib/email/email-queue', () => ({
  EmailQueueManager: jest.fn().mockImplementation(() => ({
    addToQueue: jest.fn().mockResolvedValue(undefined),
    isProcessing: jest.fn().mockReturnValue(false),
    processQueue: jest.fn().mockResolvedValue(undefined),
    getQueueLength: jest.fn().mockReturnValue(0),
    getStatus: jest.fn().mockReturnValue({
      status: 'idle',
      processed: 0,
      failed: 0,
      total: 0,
      remaining: 0,
      provider: 'test',
      rateLimit: { limit: 100, remaining: 100, resetIn: 0 }
    }),
    getLastActivity: jest.fn().mockReturnValue(Date.now()),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock the email provider
jest.mock('@/lib/email/provider-factory');

// Import handler after mocks
jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
import handler from '../../pages/api/send-bulk-email';
import { getEmailProvider } from '@/lib/email/provider-factory';

const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;

describe('/api/send-bulk-email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEmailProvider.mockReturnValue({
      name: 'test',
      sendEmail: jest.fn(),
      getRateLimit: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true)
    } as any);
  });

  it('should handle POST requests successfully', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'test@example.com',
            senderName: 'Test Sender',
            subject: 'Test Subject',
            html: '<p>Test HTML</p>',
            text: 'Test text',
            attachments: []
          }
        ],
        config: {
          senderName: 'Test Sender',
          subject: 'Test Subject',
          message: 'Test message'
        },
        sessionId: 'test-session'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.queueLength).toBe(0);
    expect(data.status).toBeDefined();
  });

  it('should handle GET requests for status', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        sessionId: 'test-session'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.status).toBe('idle');
    expect(data.processed).toBe(0);
    expect(data.total).toBe(0);
  });

  it('should handle PUT requests for pause/resume', async () => {
    // First, create a queue manager by making a POST request
    const { req: postReq, res: postRes } = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'test@example.com', senderName: 'Test', subject: 'Test', html: 'Test', text: 'Test' }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'test-session'
      }
    });
    await handler(postReq, postRes);

    // Now test the PUT request
    const { req, res } = createMocks({
      method: 'PUT',
      body: {
        action: 'pause',
        sessionId: 'test-session'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });

  it('should return 405 for unsupported methods', async () => {
    const { req, res } = createMocks({
      method: 'DELETE'
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Method not allowed');
  });

  it('should return 400 for missing emails', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        emails: [],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'test-session'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('No emails provided');
  });

  it('should return 400 for incomplete config', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'test@example.com' }],
        config: { senderName: 'Test' }, // Missing subject and message
        sessionId: 'test-session'
      }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Email configuration incomplete');
  });
});
