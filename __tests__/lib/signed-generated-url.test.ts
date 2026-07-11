import {
  createSignedGeneratedFileUrl,
  normalizeGeneratedPdfPath,
  SignedFileUrlError,
  verifySignedGeneratedFileUrl,
} from '@/lib/security/signed-generated-url';

describe('signed generated file URLs', () => {
  beforeEach(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    delete process.env.NEXTAUTH_URL;
  });

  it('returns an absolute recipient URL when the application origin is configured', () => {
    process.env.NEXTAUTH_URL = 'https://certificates.example';
    expect(createSignedGeneratedFileUrl('u_user/session/certificate.pdf'))
      .toMatch(/^https:\/\/certificates\.example\/api\/files\/download\?/);
  });

  it('creates and verifies a bounded signed URL', () => {
    const url = new URL(
      createSignedGeneratedFileUrl('individual_1/Alice Smith.pdf', 60, 1_000_000),
      'https://certificates.example',
    );

    expect(url.pathname).toBe('/api/files/download');
    expect(verifySignedGeneratedFileUrl(
      url.searchParams.get('path')!,
      url.searchParams.get('expires')!,
      url.searchParams.get('signature')!,
      1_030_000,
    )).toBe('individual_1/Alice Smith.pdf');
  });

  it('rejects tampering, expiry, traversal, and non-PDF paths', () => {
    const url = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf', 60, 1_000_000),
      'https://certificates.example',
    );
    const expires = url.searchParams.get('expires')!;
    const signature = url.searchParams.get('signature')!;

    expect(() => verifySignedGeneratedFileUrl('session/other.pdf', expires, signature, 1_000_000))
      .toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileUrl('session/certificate.pdf', expires, signature, 1_061_000))
      .toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('../secret.pdf')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('session/secret.txt')).toThrow(SignedFileUrlError);
  });

  it('requires a signing secret', () => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const previousNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: 'production' });
    try {
      expect(() => createSignedGeneratedFileUrl('session/certificate.pdf'))
        .toThrow(SignedFileUrlError);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', { configurable: true, value: previousNodeEnv });
    }
  });
});
