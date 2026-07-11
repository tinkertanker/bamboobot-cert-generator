import fs from 'fs';
import path from 'path';
import {
  loadTrustedPdf,
  PdfSourceError,
  resolveManagedLocalPdfPath,
  sanitizePdfFilename,
  validateTrustedRemotePdfUrl,
} from '@/lib/security/trusted-pdf-source';
import { getGeneratedDir } from '@/lib/paths';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

const originalEnv = process.env;
const originalFetch = global.fetch;

function mockResponse(
  body: Buffer,
  options: { status?: number; contentLength?: string } = {}
): Response {
  const status = options.status ?? 200;
  let consumed = false;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => name.toLowerCase() === 'content-length'
        ? options.contentLength ?? null
        : null,
    },
    body: {
      getReader: () => ({
        read: jest.fn(async () => {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: new Uint8Array(body) };
        }),
        cancel: jest.fn(async () => undefined),
        releaseLock: jest.fn(),
      }),
    },
  } as unknown as Response;
}

describe('trusted PDF source loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      R2_PUBLIC_URL: 'https://certs.example.com',
      S3_BUCKET_NAME: 'certificate-bucket',
      S3_REGION: 'ap-southeast-1',
      NEXTAUTH_SECRET: 'test-signing-secret',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('allows only the exact configured storage origin', () => {
    expect(validateTrustedRemotePdfUrl('https://certs.example.com/generated/a.pdf').origin)
      .toBe('https://certs.example.com');

    expect(() => validateTrustedRemotePdfUrl('https://certs.example.com.attacker.test/a.pdf'))
      .toThrow(PdfSourceError);
    expect(() => validateTrustedRemotePdfUrl('https://127.0.0.1/a.pdf?x=.r2.cloudflarestorage.com'))
      .toThrow(PdfSourceError);
  });

  it('honors a configured storage path prefix', () => {
    process.env.R2_PUBLIC_URL = 'https://certs.example.com/private-certs';

    expect(validateTrustedRemotePdfUrl(
      'https://certs.example.com/private-certs/generated/a.pdf'
    ).pathname).toBe('/private-certs/generated/a.pdf');
    expect(() => validateTrustedRemotePdfUrl(
      'https://certs.example.com/private-certs-attacker/a.pdf'
    )).toThrow(PdfSourceError);
  });

  it('rejects URL userinfo tricks before making a request', async () => {
    await expect(loadTrustedPdf(
      'https://account.r2.cloudflarestorage.com@127.0.0.1/internal.pdf'
    )).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches an approved URL without following redirects', async () => {
    const pdf = Buffer.from('%PDF-1.4\ntrusted');
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(pdf));

    await expect(loadTrustedPdf('https://certs.example.com/generated/a.pdf'))
      .resolves.toMatchObject({ buffer: pdf, source: 'remote' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://certs.example.com/generated/a.pdf',
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
    );
  });

  it('rejects a declared response that exceeds the byte limit', async () => {
    const pdf = Buffer.from('%PDF-1.4\nlarge');
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(pdf, { contentLength: '1000' }));

    await expect(loadTrustedPdf('https://certs.example.com/generated/a.pdf', 32))
      .rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('enforces the byte limit even without Content-Length', async () => {
    const pdf = Buffer.from('%PDF-1.4\nthis response is too large');
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(pdf));

    await expect(loadTrustedPdf('https://certs.example.com/generated/a.pdf', 12))
      .rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('does not let a caller raise the configured byte ceiling', async () => {
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '12';
    const pdf = Buffer.from('%PDF-1.4\nthis response is too large');
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(pdf));

    await expect(loadTrustedPdf(
      'https://certs.example.com/generated/a.pdf',
      1024
    )).rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('rejects non-PDF content from an approved origin', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse(Buffer.from('<html>not a pdf</html>')));

    await expect(loadTrustedPdf('https://certs.example.com/generated/a.pdf'))
      .rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 415 });
  });

  it('confines local sources to generated PDF paths', () => {
    const signedUrl = createSignedGeneratedFileUrl('session/cert.pdf');
    expect(resolveManagedLocalPdfPath(signedUrl)).toContain('storage/generated/session/cert.pdf');
    expect(() => resolveManagedLocalPdfPath('/generated/session/cert.pdf'))
      .toThrow(PdfSourceError);
    expect(() => resolveManagedLocalPdfPath('/generated/../../package.pdf'))
      .toThrow(PdfSourceError);
    expect(() => resolveManagedLocalPdfPath('/api/files/temp_images/u_1/cert.pdf'))
      .toThrow(PdfSourceError);
  });

  it('accepts only valid signed local download sources', () => {
    const signedUrl = createSignedGeneratedFileUrl('session/cert.pdf');
    expect(resolveManagedLocalPdfPath(signedUrl))
      .toContain('storage/generated/session/cert.pdf');

    const tamperedUrl = signedUrl.replace('session%2Fcert.pdf', 'session%2Fother.pdf');
    expect(() => resolveManagedLocalPdfPath(tamperedUrl)).toThrow(PdfSourceError);
  });

  it('rejects local symlinks that resolve outside generated storage', async () => {
    const generatedDir = path.resolve(getGeneratedDir());
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readFile = jest.spyOn(fs, 'readFileSync');
    jest.spyOn(fs, 'realpathSync').mockImplementation(((value: fs.PathLike) => {
      return path.resolve(String(value)) === generatedDir
        ? generatedDir
        : '/private/outside.pdf';
    }) as typeof fs.realpathSync);

    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('link.pdf')))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 403 });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads a real local PDF only after confinement and size checks', async () => {
    const generatedDir = path.resolve(getGeneratedDir());
    const filePath = path.join(generatedDir, 'session', 'certificate.pdf');
    const pdf = Buffer.from('%PDF-1.4\nlocal');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'realpathSync').mockImplementation(((value: fs.PathLike) => {
      return path.resolve(String(value)) === generatedDir ? generatedDir : filePath;
    }) as typeof fs.realpathSync);
    jest.spyOn(fs, 'statSync').mockReturnValue({
      isFile: () => true,
      size: pdf.length,
    } as fs.Stats);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(pdf);

    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('session/certificate.pdf')))
      .resolves.toEqual({ buffer: pdf, source: 'local' });
  });

  it('sanitizes download and archive filenames', () => {
    expect(sanitizePdfFilename('../../evil\r\nname".pdf')).toBe('evil__name_.pdf');
    expect(sanitizePdfFilename('certificate')).toBe('certificate.pdf');
    expect(sanitizePdfFilename(`${'a'.repeat(300)}.pdf`)).toMatch(/^a{176}\.pdf$/);
  });
});
