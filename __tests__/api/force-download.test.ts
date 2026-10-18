/** @jest-environment node */
import { createMocks } from 'node-mocks-http';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  loadTrustedPdf,
  PdfSourceError,
} from '@/lib/security/trusted-pdf-source';
import handler from '@/pages/api/force-download';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { installCloudflareEnv, resetCloudflareEnv } from '../helpers/cloudflare';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

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
    mockedEnforceRateLimit.mockResolvedValue({
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
      query: { url: '/api/files/download?path=u_1%2Fa.pdf&expires=1&signature=x' },
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
    mockedEnforceRateLimit.mockResolvedValue({
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
    mockedLoadTrustedPdf.mockResolvedValue({ buffer: pdf, source: 'storage' });
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        url: '/api/files/download?path=u_1%2Fa.pdf&expires=1&signature=x',
        filename: '../../custom\r\n".pdf',
      },
    });

    await handler(req, res);

    expect(mockedLoadTrustedPdf).toHaveBeenCalledWith(
      '/api/files/download?path=u_1%2Fa.pdf&expires=1&signature=x'
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
      source: 'storage',
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
        'A signed generated PDF source is required',
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
      error: 'A signed generated PDF source is required',
    });
    expect(res.getHeader('Content-Disposition')).toBeUndefined();
  });

  it('streams a signed generated PDF from R2 through the real loader', async () => {
    const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
    mockedLoadTrustedPdf.mockImplementation(actual.loadTrustedPdf);
    const { bucket } = installCloudflareEnv();
    const pdf = Buffer.from('%PDF-1.4\nfrom r2');
    bucket.seed('generated/u1/session/cert.pdf', pdf);
    try {
      const { req, res } = createMocks({
        method: 'GET',
        query: { url: createSignedGeneratedFileUrl('u1/session/cert.pdf'), filename: 'cert.pdf' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(Buffer.from(res._getData()).equals(pdf)).toBe(true);
    } finally {
      resetCloudflareEnv();
    }
  });
});
