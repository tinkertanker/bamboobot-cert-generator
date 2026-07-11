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
    resume: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Mock the email provider
jest.mock('@/lib/email/provider-factory');

// Import handler after mocks
jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn()
}));
jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } }))
}));
jest.mock('@/lib/server/tiers', () => ({
  checkEmailUsageAvailability: jest.fn(async () => ({ allowed: true, limit: 100, current: 0 })),
  reserveEmailUsage: jest.fn(async (_userId: string, count: number) => ({
    allowed: true, limit: 100, current: count
  }))
}));
import handler, { cleanupExpiredEmailQueues } from '../../pages/api/send-bulk-email';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { requireAuth } from '@/lib/auth/requireAuth';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

const mockGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const certificateUrl = createSignedGeneratedFileUrl('u_u1/test/certificate.pdf');

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
            attachments: [],
            certificateUrl
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

  it('defers queue processing until the final attachment batch', async () => {
    const first = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'first@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'deferred-batches',
        deferProcessing: true
      }
    });
    await handler(first.req, first.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    expect(queue.processQueue).not.toHaveBeenCalled();

    const final = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'second@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'deferred-batches',
        deferProcessing: true
      }
    });
    await handler(final.req, final.res);

    expect(final.res._getStatusCode()).toBe(200);
    expect(queue.addToQueue).toHaveBeenCalledTimes(2);
    expect(queue.processQueue).not.toHaveBeenCalled();

    const start = createMocks({
      method: 'PUT',
      body: { action: 'start', sessionId: 'deferred-batches' }
    });
    await handler(start.req, start.res);

    expect(start.res._getStatusCode()).toBe(200);
    expect(queue.processQueue).toHaveBeenCalledTimes(1);
  });

  it('enforces the 500-email cap across deferred batches', async () => {
    const first = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'first@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'session-email-cap',
        deferProcessing: true
      }
    });
    await handler(first.req, first.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    queue.getQueueLength.mockReturnValue(499);

    const overflow = createMocks({
      method: 'POST',
      body: {
        emails: [
          { to: 'second@example.com', subject: 'Test', html: 'Test', certificateUrl },
          { to: 'third@example.com', subject: 'Test', html: 'Test', certificateUrl }
        ],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'session-email-cap',
        deferProcessing: true
      }
    });
    await handler(overflow.req, overflow.res);

    expect(overflow.res._getStatusCode()).toBe(413);
    expect(queue.addToQueue).toHaveBeenCalledTimes(1);
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

  it('releases completed queue items after returning their terminal status', async () => {
    const post = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'done@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'completed-session',
        deferProcessing: true
      }
    });
    await handler(post.req, post.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    queue.getStatus.mockReturnValue({
      status: 'completed',
      processed: 1,
      failed: 0,
      total: 1,
      remaining: 0
    });

    const firstTerminal = createMocks({
      method: 'GET',
      query: { sessionId: 'completed-session' }
    });
    const overlappingTerminal = createMocks({
      method: 'GET',
      query: { sessionId: 'completed-session' }
    });
    await Promise.all([
      handler(firstTerminal.req, firstTerminal.res),
      handler(overlappingTerminal.req, overlappingTerminal.res)
    ]);

    expect(JSON.parse(firstTerminal.res._getData())).toMatchObject({
      status: 'completed',
      processed: 1,
      total: 1
    });
    expect(JSON.parse(overlappingTerminal.res._getData())).toMatchObject({
      status: 'completed',
      processed: 1,
      total: 1
    });
    expect(queue.clear).toHaveBeenCalledTimes(1);

    const afterCleanup = createMocks({
      method: 'GET',
      query: { sessionId: 'completed-session' }
    });
    await handler(afterCleanup.req, afterCleanup.res);
    expect(JSON.parse(afterCleanup.res._getData())).toMatchObject({
      status: 'completed',
      processed: 1,
      total: 1
    });
  });

  it('preserves all valid recipients from a mixed recipient cell', async () => {
    const post = createMocks({
      method: 'POST',
      body: {
        emails: [{
          to: 'first@example.com, invalid, second@example.com',
          subject: 'Test',
          html: 'Test',
          certificateUrl
        }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'mixed-recipient-session',
        deferProcessing: true
      }
    });

    await handler(post.req, post.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    expect(queue.addToQueue).toHaveBeenCalledWith([
      expect.objectContaining({
        to: ['first@example.com', 'second@example.com']
      })
    ]);
  });

  it('clears stale processing queues and their retained state', async () => {
    const post = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'stale@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'stale-processing-session',
        deferProcessing: true
      }
    });
    await handler(post.req, post.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    queue.getStatus.mockReturnValue({ status: 'processing' });
    queue.getLastActivity.mockReturnValue(1);
    await cleanupExpiredEmailQueues(3600002);

    expect(queue.clear).toHaveBeenCalledTimes(1);
    const get = createMocks({
      method: 'GET',
      query: { sessionId: 'stale-processing-session' }
    });
    await handler(get.req, get.res);
    expect(JSON.parse(get.res._getData())).toMatchObject({ status: 'idle', total: 0 });
  });

  it('retains paused queues for up to 24 hours', async () => {
    const post = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'paused@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'paused-session',
        deferProcessing: true
      }
    });
    await handler(post.req, post.res);

    const queueModule = jest.requireMock('@/lib/email/email-queue');
    const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
    queue.getStatus.mockReturnValue({ status: 'paused' });
    queue.getLastActivity.mockReturnValue(1);
    await cleanupExpiredEmailQueues(2 * 3600000);

    expect(queue.clear).not.toHaveBeenCalled();
    await cleanupExpiredEmailQueues(25 * 3600000);
    expect(queue.clear).toHaveBeenCalledTimes(1);
  });

  it('immediately evicts the oldest paused queue above the global byte cap', async () => {
    process.env.MAX_PAUSED_EMAIL_ATTACHMENT_BYTES = '20';
    const inlinePdf = Buffer.from('%PDF-123456789').toString('base64');
    const createPausedQueue = async (sessionId: string, lastActivity: number) => {
      const post = createMocks({
        method: 'POST',
        body: {
          emails: [{
            to: `${sessionId}@example.com`,
            subject: 'Test',
            html: 'Test',
            attachmentData: { data: inlinePdf, filename: `${sessionId}.pdf` }
          }],
          config: { senderName: 'Test', subject: 'Test', message: 'Test' },
          sessionId,
          deferProcessing: true
        }
      });
      await handler(post.req, post.res);
      const queueModule = jest.requireMock('@/lib/email/email-queue');
      const queue = queueModule.EmailQueueManager.mock.results.at(-1).value;
      queue.getStatus.mockReturnValue({ status: 'paused' });
      queue.getLastActivity.mockReturnValue(lastActivity);
      return queue;
    };

    const oldest = await createPausedQueue('paused-oldest', 1);
    const newest = await createPausedQueue('paused-newest', 2);
    const pause = createMocks({
      method: 'PUT',
      body: { action: 'pause', sessionId: 'paused-newest' }
    });
    await handler(pause.req, pause.res);

    expect(oldest.clear).toHaveBeenCalledTimes(1);
    expect(newest.clear).not.toHaveBeenCalled();
    delete process.env.MAX_PAUSED_EMAIL_ATTACHMENT_BYTES;
  });

  it('does not expose or control another user queue with the same session id', async () => {
    const post = createMocks({
      method: 'POST',
      body: {
        emails: [{ to: 'owner@example.com', subject: 'Test', html: 'Test', certificateUrl }],
        config: { senderName: 'Test', subject: 'Test', message: 'Test' },
        sessionId: 'shared-session',
        deferProcessing: true
      }
    });
    await handler(post.req, post.res);

    mockedRequireAuth.mockResolvedValueOnce({
      user: { id: 'u2' }
    } as Awaited<ReturnType<typeof requireAuth>>);
    const get = createMocks({
      method: 'GET',
      query: { sessionId: 'shared-session' }
    });
    await handler(get.req, get.res);

    mockedRequireAuth.mockResolvedValueOnce({
      user: { id: 'u2' }
    } as Awaited<ReturnType<typeof requireAuth>>);
    const put = createMocks({
      method: 'PUT',
      body: { action: 'cancel', sessionId: 'shared-session' }
    });
    await handler(put.req, put.res);

    expect(JSON.parse(get.res._getData())).toMatchObject({
      status: 'idle',
      total: 0
    });
    expect(put.res._getStatusCode()).toBe(404);
  });

  it('should handle PUT requests for pause/resume', async () => {
    // First, create a queue manager by making a POST request
    const { req: postReq, res: postRes } = createMocks({
      method: 'POST',
      body: {
        emails: [
          {
            to: 'test@example.com',
            senderName: 'Test',
            subject: 'Test',
            html: 'Test',
            text: 'Test',
            certificateUrl
          }
        ],
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
