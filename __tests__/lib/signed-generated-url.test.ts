import {
  createSignedGeneratedFileUrl,
  normalizeGeneratedPdfPath,
  SignedFileUrlError,
  verifySignedGeneratedFileCapabilityUrl,
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

  it('binds absolute capability URLs to the configured application origin and owner', () => {
    process.env.NEXTAUTH_URL = 'https://certificates.example';
    const url = createSignedGeneratedFileUrl('u_user/session/certificate.pdf');
    expect(verifySignedGeneratedFileCapabilityUrl(url, 'user'))
      .toBe('u_user/session/certificate.pdf');
    expect(() => verifySignedGeneratedFileCapabilityUrl(
      url.replace('https://certificates.example', 'https://evil.example'),
      'user',
    )).toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileCapabilityUrl(url, 'other'))
      .toThrow(SignedFileUrlError);
    const relativeUrl = new URL(url).pathname + new URL(url).search;
    expect(() => verifySignedGeneratedFileCapabilityUrl(`//evil.example${relativeUrl}`, 'user'))
      .toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileCapabilityUrl(` ${relativeUrl}`, 'user'))
      .toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileCapabilityUrl('\\\\evil.example\\api\\files\\download', 'user'))
      .toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileCapabilityUrl(`/\\evil.example${relativeUrl}`, 'user'))
      .toThrow(SignedFileUrlError);
    expect(() => verifySignedGeneratedFileCapabilityUrl(`/\\/evil.example${relativeUrl}`, 'user'))
      .toThrow(SignedFileUrlError);
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

  it('rejects encoded null bytes, encoded backslashes, and directory-like paths', () => {
    // Regression: these checks previously ran only before URL-decoding, so
    // %00 / %5C survived normalization and reached the filesystem layer.
    expect(() => normalizeGeneratedPdfPath('u_user1/a%00b.pdf')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('u_user1/..%5C..%5Csecret.pdf')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('u_user1/file.pdf/')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('u_user1/file.pdf%2F')).toThrow(SignedFileUrlError);
    // Literal (pre-decode) variants stay rejected too.
    expect(() => normalizeGeneratedPdfPath('u_user1/a\0b.pdf')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('u_user1\\file.pdf')).toThrow(SignedFileUrlError);
  });

  it('rejects PDF paths whose basename is only an extension or that hide the extension', () => {
    expect(() => normalizeGeneratedPdfPath('u_user1/.pdf')).toThrow(SignedFileUrlError);
    expect(() => normalizeGeneratedPdfPath('u_user1/report.pdf.exe')).toThrow(SignedFileUrlError);
    expect(normalizeGeneratedPdfPath('u_user1/REPORT.PDF')).toBe('u_user1/REPORT.PDF');
  });

  it('enforces expiry boundaries exactly', () => {
    const url = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf', 60, 1_000_000),
      'https://certificates.example',
    );
    const expires = url.searchParams.get('expires')!;
    const signature = url.searchParams.get('signature')!;

    // expires === now is still valid; one second past is not.
    expect(verifySignedGeneratedFileUrl('session/certificate.pdf', expires, signature, Number(expires) * 1000))
      .toBe('session/certificate.pdf');
    expect(() => verifySignedGeneratedFileUrl('session/certificate.pdf', expires, signature, (Number(expires) + 1) * 1000))
      .toThrow(SignedFileUrlError);
    // Non-numeric, negative, float, and overlong expiry strings are rejected.
    for (const bad of ['', '-1', '1e9', '106.5', '10600000000000000000000']) {
      expect(() => verifySignedGeneratedFileUrl('session/certificate.pdf', bad, signature, 1_000_000))
        .toThrow(SignedFileUrlError);
    }
  });

  it('rejects a forged far-future expiry even with a matching signature shape', () => {
    // An attacker who could pick any expiry must not exceed the 90-day cap.
    const farFuture = String(Math.floor(1_000_000 / 1000) + 91 * 24 * 60 * 60);
    expect(() => verifySignedGeneratedFileUrl('session/certificate.pdf', farFuture, 'x', 1_000_000))
      .toThrow(SignedFileUrlError);
  });

  it('rejects empty, truncated, and length-mismatched signatures without throwing TypeError', () => {
    const url = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf', 60, 1_000_000),
      'https://certificates.example',
    );
    const expires = url.searchParams.get('expires')!;
    const signature = url.searchParams.get('signature')!;
    for (const bad of ['', signature.slice(0, -1), `${signature}A`, signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A')]) {
      expect(() => verifySignedGeneratedFileUrl('session/certificate.pdf', expires, bad, 1_000_000))
        .toThrow(SignedFileUrlError);
    }
  });

  it('clamps non-finite and out-of-range TTLs at creation time', () => {
    for (const ttl of [Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
      const url = new URL(
        createSignedGeneratedFileUrl('session/certificate.pdf', ttl, 1_000_000),
        'https://certificates.example',
      );
      const expires = Number(url.searchParams.get('expires'));
      expect(expires).toBeGreaterThan(1_000);
      expect(expires - 1_000).toBeLessThanOrEqual(90 * 24 * 60 * 60);
    }
  });

  it('does not authorize a sibling user whose id is a prefix of the owner', () => {
    process.env.NEXTAUTH_URL = 'https://certificates.example';
    const url = createSignedGeneratedFileUrl('u_user12/session/certificate.pdf');
    expect(() => verifySignedGeneratedFileCapabilityUrl(url, 'user1'))
      .toThrow(SignedFileUrlError);
    expect(verifySignedGeneratedFileCapabilityUrl(url, 'user12'))
      .toBe('u_user12/session/certificate.pdf');
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
