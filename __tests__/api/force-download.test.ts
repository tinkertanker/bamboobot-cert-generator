import { createMocks } from 'node-mocks-http';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  loadTrustedPdf,
  PdfSourceError,
} from '@/lib/security/trusted-pdf-source';
import handler from '@/pages/api/force-download';

jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
  default: jest.fn(),
}));

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(),
}));

jest.mock('@/lib/security/trusted-pdf-source', () => {
  const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
  return { ...actual, loadTrustedPdf: jest.fn() };
});

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedEnforceRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;
const mockedLoadTrustedPdf = loadTrustedPdf as jest.MockedFunction<typeof loadTrustedPdf>;

describe('/api/force-download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: { id: 'u1' } } as any);
    mockedEnforceRateLimit.mockReturnValue({
      allowed: true,
      retryAfter: 0,
      limit: 30,
      remaining: 29,
    });
  });

  it('rejects non-GET requests before authentication', async () => {
    const { req, res } = createMocks({ method: 'POST' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it('does not load a source when authentication fails', async () => {
    mockedRequireAuth.mockResolvedValue(null);
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: 'https://certs.example.com/generated/a.pdf' },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('rejects a non-string URL parameter', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: 123 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'URL parameter is required' });
  });

  it('rate-limits downloads before loading the source', async () => {
    mockedEnforceRateLimit.mockReturnValue({
      allowed: false,
      retryAfter: 60,
      limit: 30,
      remaining: 0,
    });
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: '/generated/a.pdf' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(429);
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('loads only through the trusted source loader and sanitizes the filename', async () => {
    const pdf = Buffer.from('%PDF-1.4\ntrusted');
    mockedLoadTrustedPdf.mockResolvedValue({ buffer: pdf, source: 'remote' });
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        url: 'https://certs.example.com/generated/a.pdf',
        filename: '../../custom\r\n".pdf',
      },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).toHaveBeenCalledWith(
      'https://certs.example.com/generated/a.pdf'
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res.getHeader('Content-Disposition')).toBe(
      'attachment; filename="custom___.pdf"'
    );
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(res._getData()).toEqual(pdf);
  });

  it('uses a safe default filename', async () => {
    mockedLoadTrustedPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.4\ntrusted'),
      source: 'local',
    });
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: '/generated/a.pdf' },
    });

    await handler(req, res);

    expect(res.getHeader('Content-Disposition')).toBe(
      'attachment; filename="download.pdf"'
    );
  });

  it('returns the trusted loader error without setting download headers', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(
      new PdfSourceError(
        'INVALID_SOURCE',
        'PDF source is not an approved storage origin',
        403
      )
    );
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: 'https://attacker.example/internal.pdf' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'PDF source is not an approved storage origin',
    });
    expect(res.getHeader('Content-Disposition')).toBeUndefined();
  });
});
