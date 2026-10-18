/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

describe('generated file retention ownership', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    ({ bucket } = installCloudflareEnv());
    bucket.seed(
      'generated/u_user/session/certificate.pdf',
      '%PDF-1.4',
      { type: 'individual', retention: '90d', created: '2026-01-01T00:00:00.000Z', emailsent: 'false' },
      'application/pdf'
    );
    bucket.seed('generated/u_victim/session/certificate.pdf', '%PDF-1.4');
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    resetCloudflareEnv();
  });

  it('marks the verified user-scoped object and keeps its content type', async () => {
    const url = createSignedGeneratedFileUrl('u_user/session/certificate.pdf');

    await markGeneratedFileAsEmailed(url, 'user');

    const stored = bucket.objects.get('generated/u_user/session/certificate.pdf');
    expect(stored?.customMetadata).toMatchObject({
      emailsent: 'true',
      retention: '90d',
      type: 'individual',
      created: '2026-01-01T00:00:00.000Z',
    });
    expect(stored?.httpMetadata.contentType).toBe('application/pdf');
    expect(Buffer.from(stored?.data ?? []).toString()).toBe('%PDF-1.4');
  });

  it('rejects a capability owned by another user', async () => {
    const url = createSignedGeneratedFileUrl('u_victim/session/certificate.pdf');

    await expect(markGeneratedFileAsEmailed(url, 'attacker')).rejects.toMatchObject({ statusCode: 403 });
    expect(bucket.objects.get('generated/u_victim/session/certificate.pdf')?.customMetadata).toEqual({});
  });
});
