import { createMocks } from 'node-mocks-http';
import { requireAuth } from '@/lib/auth/requireAuth';
import {
  loadTrustedPdf,
  PdfSourceError,
} from '@/lib/security/trusted-pdf-source';
import handler from '@/pages/api/zip-pdfs';

jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn(),
}));

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  buildKey: jest.fn(() => 'zip:test'),
  rateLimit: jest.fn(() => ({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  })),
}));

jest.mock('@/lib/security/trusted-pdf-source', () => {
  const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
  return { ...actual, loadTrustedPdf: jest.fn() };
});

const mockArchive = {
  pipe: jest.fn(),
  append: jest.fn(),
  abort: jest.fn(),
  finalize: jest.fn<Promise<void>, []>(),
  on: jest.fn(),
  pointer: jest.fn(() => 1024),
};

jest.mock('archiver', () => jest.fn(() => mockArchive));

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedLoadTrustedPdf = loadTrustedPdf as jest.MockedFunction<typeof loadTrustedPdf>;
const originalEnv = process.env;

describe('/api/zip-pdfs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockedRequireAuth.mockResolvedValue({ user: { id: 'u1' } } as any);
    mockArchive.finalize.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it('validates the file list before authentication', async () => {
    const { req, res } = createMocks({ method: 'POST', body: {} });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'No files provided' });
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it('rejects oversized and malformed file lists', async () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => ({
      url: `/generated/${index}.pdf`,
      filename: `${index}.pdf`,
    }));
    const first = createMocks({ method: 'POST', body: { files: tooMany } });
    await handler(first.req, first.res);
    expect(first.res._getStatusCode()).toBe(413);

    const second = createMocks({
      method: 'POST',
      body: { files: [{ url: '/generated/a.pdf' }] },
    });
    await handler(second.req, second.res);
    expect(second.res._getStatusCode()).toBe(400);
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('does not load sources when authentication fails', async () => {
    mockedRequireAuth.mockResolvedValue(null);
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url: '/generated/a.pdf', filename: 'a.pdf' }] },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('loads every PDF through the trusted loader and sanitizes ZIP entry names', async () => {
    const firstPdf = Buffer.from('%PDF-1.4\nfirst');
    const secondPdf = Buffer.from('%PDF-1.4\nsecond');
    mockedLoadTrustedPdf
      .mockResolvedValueOnce({ buffer: firstPdf, source: 'local' })
      .mockResolvedValueOnce({ buffer: secondPdf, source: 'remote' });
    const files = [
      { url: '/generated/one.pdf', filename: '../../one\r\n.pdf' },
      { url: 'https://certs.example.com/generated/two.pdf', filename: 'two.pdf' },
    ];
    const { req, res } = createMocks({ method: 'POST', body: { files } });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(2);
    expect(mockedLoadTrustedPdf).toHaveBeenNthCalledWith(
      1,
      '/generated/one.pdf',
      expect.any(Number),
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    );
    expect(mockArchive.append).toHaveBeenNthCalledWith(
      1,
      firstPdf,
      { name: 'one__.pdf' }
    );
    expect(mockArchive.append).toHaveBeenNthCalledWith(
      2,
      secondPdf,
      { name: 'two.pdf' }
    );
    expect(mockArchive.finalize).toHaveBeenCalledTimes(1);
    expect(res._getHeaders()['content-type']).toBe('application/zip');
    expect(res._getHeaders()['cache-control']).toBe('private, no-store');
  });

  it('skips rejected sources without adding them to the archive', async () => {
    mockedLoadTrustedPdf
      .mockRejectedValueOnce(new PdfSourceError('INVALID_SOURCE', 'Rejected', 403))
      .mockResolvedValueOnce({
        buffer: Buffer.from('%PDF-1.4\ngood'),
        source: 'local',
      });
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        files: [
          { url: 'https://attacker.example/a.pdf', filename: 'bad.pdf' },
          { url: '/generated/good.pdf', filename: 'good.pdf' },
        ],
      },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(2);
    expect(mockArchive.append).toHaveBeenCalledTimes(1);
    expect(mockArchive.finalize).toHaveBeenCalledTimes(1);
  });

  it('stops after a too-large source to bound rejected input reads', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(
      new PdfSourceError('PDF_TOO_LARGE', 'Too large', 413)
    );
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        files: [
          { url: '/generated/large.pdf', filename: 'large.pdf' },
          { url: '/generated/never-read.pdf', filename: 'other.pdf' },
        ],
      },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(1);
    expect(mockArchive.finalize).toHaveBeenCalledTimes(1);
  });

  it('turns asynchronous archive errors into a handled 500 response', async () => {
    mockedLoadTrustedPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\ngood'),
      source: 'local',
    });
    mockArchive.finalize.mockImplementationOnce(async () => {
      const errorHandler = mockArchive.on.mock.calls.find(([event]) => event === 'error')?.[1];
      errorHandler?.(new Error('archive failed'));
    });
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url: '/generated/a.pdf', filename: 'a.pdf' }] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Failed to create ZIP file' });
  });

  it('handles an archive error emitted during an awaited source load', async () => {
    mockedLoadTrustedPdf.mockImplementationOnce(async () => {
      const errorHandler = mockArchive.on.mock.calls.find(([event]) => event === 'error')?.[1];
      errorHandler?.(new Error('early archive failure'));
      return { buffer: Buffer.from('%PDF-1.4\ngood'), source: 'local' };
    });
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url: '/generated/a.pdf', filename: 'a.pdf' }] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(mockArchive.append).not.toHaveBeenCalled();
    expect(mockArchive.finalize).not.toHaveBeenCalled();
  });

  it('aborts work that exceeds the whole ZIP deadline', async () => {
    process.env.MAX_ZIP_DURATION_MS = '5';
    mockedLoadTrustedPdf.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { buffer: Buffer.from('%PDF-1.4\nlate'), source: 'remote' };
    });
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [{ url: '/generated/a.pdf', filename: 'a.pdf' }] },
    });

    await handler(req, res);

    expect(mockArchive.abort).toHaveBeenCalledTimes(1);
    expect(mockArchive.append).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(500);
  });
});
