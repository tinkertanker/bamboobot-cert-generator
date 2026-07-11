import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/zip-pdfs';

jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn(),
}));

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })),
}));

jest.mock('@/lib/rate-limit', () => ({
  buildKey: jest.fn(() => 'zip:custom-domain'),
  rateLimit: jest.fn(() => ({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  })),
}));

const mockArchive = {
  pipe: jest.fn(),
  append: jest.fn(),
  abort: jest.fn(),
  finalize: jest.fn<Promise<void>, []>(() => Promise.resolve()),
  on: jest.fn(),
  pointer: jest.fn(() => 1024),
};

jest.mock('archiver', () => jest.fn(() => mockArchive));

const originalEnv = process.env;
const originalFetch = global.fetch;

function pdfResponse(pdf: Buffer): Response {
  let consumed = false;
  return {
    ok: true,
    status: 200,
    headers: { get: () => String(pdf.length) },
    body: {
      getReader: () => ({
        read: jest.fn(async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: new Uint8Array(pdf) };
        }),
        cancel: jest.fn(async () => undefined),
        releaseLock: jest.fn(),
      }),
    },
  } as unknown as Response;
}

describe('/api/zip-pdfs trusted remote storage integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_PUBLIC_URL: 'https://certs.example.com',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('fetches an exact custom-domain URL and appends the validated PDF', async () => {
    const pdf = Buffer.from('%PDF-1.4\ncustom domain');
    (global.fetch as jest.Mock).mockResolvedValue(pdfResponse(pdf));
    const url = 'https://certs.example.com/generated/a.pdf';
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url, filename: 'a.pdf' }] },
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ redirect: 'error', signal: expect.anything() })
    );
    expect(mockArchive.append).toHaveBeenCalledWith(pdf, { name: 'a.pdf' });
    expect(res._getStatusCode()).toBe(200);
  });

  it('supports signed URLs on the configured R2 endpoint', async () => {
    const pdf = Buffer.from('%PDF-1.4\nsigned');
    (global.fetch as jest.Mock).mockResolvedValue(pdfResponse(pdf));
    const url = 'https://account.r2.cloudflarestorage.com/bucket/generated/a.pdf?X-Amz-Signature=test';
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url, filename: 'signed.pdf' }] },
    });

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockArchive.append).toHaveBeenCalledWith(pdf, { name: 'signed.pdf' });
  });

  it('rejects hostname-prefix tricks without making a request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        files: [{
          url: 'https://certs.example.com.attacker.test/internal.pdf',
          filename: 'bad.pdf',
        }],
      },
    });

    await handler(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockArchive.append).not.toHaveBeenCalled();
    expect(mockArchive.finalize).toHaveBeenCalledTimes(1);
  });
});
