/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import { deleteObjects, ensureSafeStorageKey, formatBytes, isProtectedStorageRoot, listAllObjects } from '@/lib/storage-manager';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

describe('storage manager deletion boundaries', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetCloudflareEnv();
  });

  it('rejects non-canonical and cross-platform traversal keys', () => {
    expect(ensureSafeStorageKey('generated/u_1/file.pdf')).toBe(true);
    expect(ensureSafeStorageKey('generated/../../secret')).toBe(false);
    expect(ensureSafeStorageKey('generated/u_1/../secret')).toBe(false);
    expect(ensureSafeStorageKey('generated\\..\\secret')).toBe(false);
    expect(ensureSafeStorageKey('/generated/file.pdf')).toBe(false);
    expect(ensureSafeStorageKey('generated/u_1/fi\0le.pdf')).toBe(false);
    expect(ensureSafeStorageKey('generated//u_1/file.pdf')).toBe(false);
    expect(ensureSafeStorageKey('email_queue/u_1/file.pdf')).toBe(false);
    expect(ensureSafeStorageKey(undefined)).toBe(false);
    expect(ensureSafeStorageKey(['generated/u_1/file.pdf'])).toBe(false);
    // A bare namespace root is a canonical key, so the protected-root guard
    // must be the layer that refuses it.
    expect(ensureSafeStorageKey('generated/')).toBe(true);
    expect(isProtectedStorageRoot('generated/')).toBe(true);
    expect(isProtectedStorageRoot('temp_images/')).toBe(true);
  });

  it('reports malformed actions as errors and treats missing keys as idempotent no-ops', async () => {
    const result = await deleteObjects([
      null as unknown as { key?: unknown },
      {},
      { key: 'generated/valid-but-bad-flag.pdf', isPrefix: 'yes' as unknown as boolean },
      { key: 'generated/does-not-exist.pdf' },
      { key: 'generated/', isPrefix: true },
    ]);

    expect(result.deleted).toEqual(['generated/does-not-exist.pdf']);
    expect(result.errors).toEqual([
      '<invalid key>',
      '<invalid key>',
      'generated/valid-but-bad-flag.pdf',
      'generated/',
    ]);
  });

  it('formats byte counts defensively', () => {
    // Regression: NaN/negative/Infinity used to render as "NaN undefined".
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(0.5)).toBe('0.50 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 ** 5)).toBe('1024 TB');
  });

  it('never deletes outside the storage namespaces through traversal', async () => {
    bucket.seed('secret.txt', 'keep me');
    bucket.seed('email_queue/u_1/a.pdf', 'keep me');

    const result = await deleteObjects([
      { key: 'generated/../../secret.txt' },
      { key: 'generated/../email_queue/', isPrefix: true },
      { key: 'email_queue/u_1/a.pdf' },
    ]);

    expect(result.deleted).toEqual([]);
    expect(result.errors).toEqual(['generated/../../secret.txt', 'generated/../email_queue/', 'email_queue/u_1/a.pdf']);
    expect(bucket.objects.size).toBe(2);
  });

  it('lists only objects inside the storage namespaces', async () => {
    bucket.seed('generated/valid.pdf', 'pdf');
    bucket.seed('temp_images/u_1/img.png', 'png');
    bucket.seed('email_queue/u_1/a.pdf', 'queued');

    expect((await listAllObjects()).map(item => item.key)).toEqual(['generated/valid.pdf', 'temp_images/u_1/img.png']);
    await expect(deleteObjects([{ key: 'generated/valid.pdf' }])).resolves.toEqual({
      deleted: ['generated/valid.pdf'],
      errors: [],
    });
    expect(bucket.objects.has('generated/valid.pdf')).toBe(false);
  });

  it('flags namespace roots as protected and descendants as deletable', () => {
    expect(isProtectedStorageRoot('generated/')).toBe(true);
    expect(isProtectedStorageRoot('temp_images/')).toBe(true);
    expect(isProtectedStorageRoot('generated/u_1/')).toBe(false);
    expect(isProtectedStorageRoot('temp_images/u_1/img.png')).toBe(false);
  });

  it('refuses to delete a namespace root even with isPrefix', async () => {
    bucket.seed('generated/loose.pdf', 'loose');
    bucket.seed('generated/batch-1/cert.pdf', 'nested');
    bucket.seed('temp_images/u_1/img.png', 'temp');

    await expect(deleteObjects([
      { key: 'generated/', isPrefix: true },
      { key: 'temp_images/', isPrefix: true },
      { key: 'generated/' },
      { key: 'temp_images/' },
    ])).resolves.toEqual({
      deleted: [],
      errors: ['generated/', 'temp_images/', 'generated/', 'temp_images/'],
    });
    expect(bucket.objects.size).toBe(3);
  });

  it('deletes every object under a canonical descendant prefix', async () => {
    bucket.seed('generated/batch-1/cert.pdf', 'batch');
    bucket.seed('generated/batch-1/sub/cert2.pdf', 'batch');
    bucket.seed('generated/keep.pdf', 'keep');
    bucket.seed('temp_images/u_1/img.png', 'temp');

    await expect(deleteObjects([
      { key: 'generated/batch-1/', isPrefix: true },
      { key: 'temp_images/u_1/', isPrefix: true },
    ])).resolves.toEqual({
      deleted: ['generated/batch-1/cert.pdf', 'generated/batch-1/sub/cert2.pdf', 'temp_images/u_1/img.png'],
      errors: [],
    });
    expect([...bucket.objects.keys()]).toEqual(['generated/keep.pdf']);
  });

  it('treats a prefix without a trailing slash as a folder, not a key prefix', async () => {
    bucket.seed('generated/u_1/a.pdf', 'one');
    bucket.seed('generated/u_10/b.pdf', 'ten');

    await expect(deleteObjects([{ key: 'generated/u_1', isPrefix: true }])).resolves.toEqual({
      deleted: ['generated/u_1/a.pdf'],
      errors: [],
    });
    expect([...bucket.objects.keys()]).toEqual(['generated/u_10/b.pdf']);
  });

  it('reports an action as an error when storage fails', async () => {
    jest.spyOn(bucket, 'delete').mockRejectedValueOnce(new Error('R2 down'));
    bucket.seed('generated/a.pdf', 'a');

    await expect(deleteObjects([{ key: 'generated/a.pdf' }])).resolves.toEqual({
      deleted: [],
      errors: ['generated/a.pdf'],
    });
  });
});
