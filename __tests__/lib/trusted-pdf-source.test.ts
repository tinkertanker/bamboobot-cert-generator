/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import {
  assertPdfBuffer,
  getMaxPdfSourceBytes,
  loadTrustedPdf,
  PdfSourceError,
  resolveSignedGeneratedPdfPath,
  sanitizePdfFilename,
} from '@/lib/security/trusted-pdf-source';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const originalEnv = process.env;

describe('trusted PDF source loading', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', NEXTAUTH_SECRET: 'test-signing-secret' };
    delete process.env.NEXTAUTH_URL;
    delete process.env.MAX_PDF_SOURCE_SIZE_BYTES;
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetCloudflareEnv();
    process.env = originalEnv;
  });

  it('reads a signed generated PDF from R2', async () => {
    const pdf = Buffer.from('%PDF-1.4\nstored');
    bucket.seed('generated/u_1/session/cert.pdf', pdf);

    const result = await loadTrustedPdf(createSignedGeneratedFileUrl('u_1/session/cert.pdf'));

    expect(result.source).toBe('storage');
    expect(result.buffer.equals(pdf)).toBe(true);
  });

  it('accepts a signed URL on any host but only the download path', async () => {
    bucket.seed('generated/u_1/cert.pdf', '%PDF-1.4');
    const relative = createSignedGeneratedFileUrl('u_1/cert.pdf');

    await expect(loadTrustedPdf(`https://certs.example.com${relative}`)).resolves.toMatchObject({ source: 'storage' });
    expect(() => resolveSignedGeneratedPdfPath(relative.replace('/api/files/download', '/api/files/other')))
      .toThrow(PdfSourceError);
  });

  it('never reads arbitrary or unsigned sources', async () => {
    const get = jest.spyOn(bucket, 'get');
    for (const source of [
      'https://account.r2.cloudflarestorage.com@127.0.0.1/internal.pdf',
      'https://certs.example.com/generated/a.pdf',
      '/generated/u_1/cert.pdf',
      '/api/files/temp_images/u_1/cert.pdf',
    ]) {
      await expect(loadTrustedPdf(source)).rejects.toBeInstanceOf(PdfSourceError);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a tampered or expired signature', async () => {
    const signed = createSignedGeneratedFileUrl('u_1/cert.pdf');
    await expect(loadTrustedPdf(signed.replace('cert.pdf', 'other.pdf')))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 403 });

    const expired = createSignedGeneratedFileUrl('u_1/cert.pdf', 60, Date.now() - 3_600_000);
    await expect(loadTrustedPdf(expired)).rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 403 });
  });

  it('rejects traversal in the signed path', () => {
    expect(() => createSignedGeneratedFileUrl('../u_2/cert.pdf')).toThrow();
  });

  it('reports a missing object as not found', async () => {
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/missing.pdf')))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('enforces the caller byte limit', async () => {
    bucket.seed('generated/u_1/large.pdf', '%PDF-1.4\nthis object is too large');
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/large.pdf'), 12))
      .rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('does not let a caller raise the configured byte ceiling', async () => {
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '12';
    bucket.seed('generated/u_1/large.pdf', '%PDF-1.4\nthis object is too large');
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/large.pdf'), 1024))
      .rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('rejects stored content that is not a PDF', async () => {
    bucket.seed('generated/u_1/fake.pdf', '<html>not a pdf</html>');
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/fake.pdf')))
      .rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 415 });
  });

  it('reports storage failures as a fetch error', async () => {
    jest.spyOn(bucket, 'get').mockRejectedValueOnce(new Error('R2 down'));
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/cert.pdf')))
      .rejects.toMatchObject({ code: 'FETCH_FAILED', statusCode: 502 });
  });

  it('falls back to the default size limit when the env value has trailing garbage', () => {
    // Regression: parseInt('10MB') used to truncate to a 10-byte ceiling,
    // silently breaking every PDF load.
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '10MB';
    expect(getMaxPdfSourceBytes()).toBe(25 * 1024 * 1024);
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '12';
    expect(getMaxPdfSourceBytes()).toBe(12);
    for (const bad of ['-1', '0', 'NaN', '1.5', '']) {
      process.env.MAX_PDF_SOURCE_SIZE_BYTES = bad;
      expect(getMaxPdfSourceBytes()).toBe(25 * 1024 * 1024);
    }
  });

  it('accepts a PDF header anywhere within the first 1024 bytes and nowhere later', () => {
    expect(() => assertPdfBuffer(
      Buffer.concat([Buffer.alloc(1019, 0x20), Buffer.from('%PDF-1.4')])
    )).not.toThrow();
    expect(() => assertPdfBuffer(
      Buffer.concat([Buffer.alloc(1020, 0x20), Buffer.from('%PDF-1.4')])
    )).toThrow(PdfSourceError);
    expect(() => assertPdfBuffer(Buffer.alloc(0))).toThrow(PdfSourceError);
  });

  it('rejects oversized, incomplete or empty sources without reading storage', async () => {
    const get = jest.spyOn(bucket, 'get');
    await expect(loadTrustedPdf(`/api/files/download?path=${'a'.repeat(8_192)}.pdf`))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 400 });
    await expect(loadTrustedPdf('/api/files/download?path=session%2Fcert.pdf&expires=1'))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 400 });
    await expect(loadTrustedPdf('')).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    await expect(loadTrustedPdf(123 as unknown as string)).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
    await expect(loadTrustedPdf(createSignedGeneratedFileUrl('u_1/cert.pdf'), Number.NaN))
      .rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 500 });
    expect(get).not.toHaveBeenCalled();
  });

  it('sanitizes download and archive filenames', () => {
    expect(sanitizePdfFilename('../../evil\r\nname".pdf')).toBe('evil__name_.pdf');
    expect(sanitizePdfFilename('certificate')).toBe('certificate.pdf');
    expect(sanitizePdfFilename(`${'a'.repeat(300)}.pdf`)).toMatch(/^a{176}\.pdf$/);
    expect(sanitizePdfFilename(undefined)).toBe('download.pdf');
    expect(sanitizePdfFilename(42)).toBe('download.pdf');
    expect(sanitizePdfFilename('...')).toBe('download.pdf');
    expect(sanitizePdfFilename(null, '../fall\r\nback.pdf')).toBe('fall__back.pdf');
  });
});
