/** @jest-environment node */
import httpMocks from 'node-mocks-http';
import JSZip from 'jszip';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
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
  enforceRateLimit: jest.fn(async () => ({ allowed: true, limit: 5, remaining: 4, resetAt: Date.now() + 60_000 })),
}));
jest.mock('@/lib/security/trusted-pdf-source', () => {
  const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
  return { ...actual, loadTrustedPdf: jest.fn(actual.loadTrustedPdf) };
});

import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadTrustedPdf, PdfSourceError } from '@/lib/security/trusted-pdf-source';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import handler from '@/pages/api/zip-pdfs';
import { silenceConsole } from '../helpers/silence-console';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedLoadTrustedPdf = loadTrustedPdf as jest.MockedFunction<typeof loadTrustedPdf>;
const actualLoadTrustedPdf = jest.requireActual('@/lib/security/trusted-pdf-source').loadTrustedPdf;
const originalEnv = process.env;
let bucket: FakeR2Bucket;

function seedPdf(relativePath: string, text: string): string {
  bucket.seed(`generated/${relativePath}`, `%PDF-1.4\n${text}`, {}, 'application/pdf');
  return createSignedGeneratedFileUrl(relativePath);
}

/** A response that collects the streamed ZIP bytes. */
function zipResponse() {
  const res = httpMocks.createResponse();
  const chunks: Buffer[] = [];
  res.write = ((chunk: Buffer) => {
    chunks.push(Buffer.from(chunk));
    return true;
  }) as typeof res.write;
  return { res, body: () => Buffer.concat(chunks) };
}

async function call(body: unknown, method: 'GET' | 'POST' = 'POST') {
  const req = httpMocks.createRequest({ method, body: body as Record<string, unknown> });
  const response = zipResponse();
  await handler(req as never, response.res as never);
  return response;
}

describe('/api/zip-pdfs', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoadTrustedPdf.mockImplementation(actualLoadTrustedPdf);
    process.env = { ...originalEnv };
    delete process.env.NEXTAUTH_URL;
    mockedRequireAuth.mockResolvedValue({ user: { id: 'u1' } } as never);
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    process.env = originalEnv;
    resetCloudflareEnv();
  });

  it('returns 405 for non-POST requests', async () => {
    const { res } = await call(undefined, 'GET');
    expect(res._getStatusCode()).toBe(405);
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it('validates the file list before authentication', async () => {
    const { res, body } = await call({});
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(body().toString() || res._getData())).toEqual({ error: 'No files provided' });
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it('rejects oversized and malformed file lists', async () => {
    const tooMany = Array.from({ length: 501 }, (_, index) => ({ url: `/x/${index}.pdf`, filename: `${index}.pdf` }));
    expect((await call({ files: tooMany })).res._getStatusCode()).toBe(413);
    expect((await call({ files: [{ url: '/x/a.pdf' }] })).res._getStatusCode()).toBe(400);
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('does not load sources when authentication fails', async () => {
    mockedRequireAuth.mockResolvedValue(null);
    await call({ files: [{ url: '/x/a.pdf', filename: 'a.pdf' }] });
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('returns 429 when the ZIP rate limit is exceeded', async () => {
    (enforceRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false });
    const { res } = await call({ files: [{ url: '/x/a.pdf', filename: 'a.pdf' }] });
    expect(res._getStatusCode()).toBe(429);
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('streams a valid ZIP of signed PDFs from R2 with sanitised entry names', async () => {
    const files = [
      { url: seedPdf('u_u1/individual_1/one.pdf', 'first'), filename: '../../one\r\n.pdf' },
      { url: seedPdf('u_u1/individual_1/two.pdf', 'second'), filename: 'two.pdf' },
    ];
    const { res, body } = await call({ files });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-type']).toBe('application/zip');
    expect(res._getHeaders()['cache-control']).toBe('private, no-store');
    expect(res._isEndCalled()).toBe(true);

    const zip = await JSZip.loadAsync(body());
    expect(Object.keys(zip.files)).toEqual(['one__.pdf', 'two.pdf']);
    await expect(zip.file('one__.pdf')!.async('string')).resolves.toBe('%PDF-1.4\nfirst');
    await expect(zip.file('two.pdf')!.async('string')).resolves.toBe('%PDF-1.4\nsecond');
  });

  it('skips unsigned, remote and missing sources without fetching anything', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const files = [
      { url: 'https://attacker.example/a.pdf', filename: 'remote.pdf' },
      { url: '/api/files/download?path=u_other%2Fa.pdf&expires=9999999999&signature=forged', filename: 'forged.pdf' },
      { url: createSignedGeneratedFileUrl('u_u1/missing.pdf'), filename: 'missing.pdf' },
      { url: seedPdf('u_u1/good.pdf', 'good'), filename: 'good.pdf' },
    ];
    const { res, body } = await call({ files });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(res._getStatusCode()).toBe(200);
    const zip = await JSZip.loadAsync(body());
    expect(Object.keys(zip.files)).toEqual(['good.pdf']);
  });

  it('stops after a too-large source to bound rejected input reads', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(new PdfSourceError('PDF_TOO_LARGE', 'Too large', 413));
    const { res, body } = await call({
      files: [
        { url: '/x/large.pdf', filename: 'large.pdf' },
        { url: '/x/never-read.pdf', filename: 'other.pdf' },
      ],
    });

    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
    expect(Object.keys((await JSZip.loadAsync(body())).files)).toEqual([]);
  });

  it('stops after repeated source failures', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(new PdfSourceError('NOT_FOUND', 'Missing', 404));
    const files = Array.from({ length: 10 }, (_, index) => ({ url: `/x/${index}.pdf`, filename: `${index}.pdf` }));
    await call({ files });
    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(5);
  });

  it('stops reading sources once the whole ZIP deadline has passed', async () => {
    process.env.MAX_ZIP_DURATION_MS = '5';
    const url = seedPdf('u_u1/late.pdf', 'late');
    mockedLoadTrustedPdf.mockImplementationOnce(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return actualLoadTrustedPdf(...args);
    });
    const { res } = await call({ files: [{ url, filename: 'a.pdf' }, { url, filename: 'b.pdf' }] });

    // The deadline is checked before each source, so the second is never read
    // and the archive is not finished.
    expect(mockedLoadTrustedPdf).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(500);
  });
});
