/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import {
  cleanupExpiredFiles,
  deleteObjectKeys,
  getBucket,
  getObjectBytes,
  inferRetention,
  listObjects,
  markObjectAsEmailed,
  putObject,
} from '@/lib/storage/bucket';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('R2 bucket storage', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetCloudflareEnv();
  });

  it('fails clearly when the FILES binding is missing', () => {
    installCloudflareEnv({ FILES: undefined });
    expect(() => getBucket()).toThrow('FILES (R2) binding is not configured');
  });

  it('infers retention from the key', () => {
    expect(inferRetention('email_queue/u_1/s/individual_1/0.pdf')).toEqual({ type: 'preview', retention: '7d' });
    expect(inferRetention('generated/u_1/individual_1/a.pdf')).toEqual({ type: 'individual', retention: '90d' });
    expect(inferRetention('generated/u_1/certificates_1.pdf')).toEqual({ type: 'bulk', retention: '7d' });
    expect(inferRetention('generated/u_1/preview_1.pdf')).toEqual({ type: 'preview', retention: '24h' });
    expect(inferRetention('temp_images/u_1/template.png')).toEqual({ type: 'template', retention: 'permanent' });
  });

  it('stores content type and lowercased lifecycle metadata', async () => {
    await putObject('email_queue/u_1/s/i/0.pdf', new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });

    const stored = bucket.objects.get('email_queue/u_1/s/i/0.pdf');
    expect(stored?.httpMetadata.contentType).toBe('application/pdf');
    expect(stored?.customMetadata).toEqual({
      type: 'preview',
      retention: '7d',
      created: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      emailsent: 'false',
      downloadcount: '0',
    });
    expect(Array.from(stored?.data ?? [])).toEqual([1, 2, 3]);
  });

  it('defaults the content type to octet-stream', async () => {
    await putObject('generated/u_1/a.bin', 'x');
    expect(bucket.objects.get('generated/u_1/a.bin')?.httpMetadata.contentType).toBe('application/octet-stream');
  });

  it('reads bytes within a size limit and refuses larger objects', async () => {
    bucket.seed('generated/u_1/a.pdf', '12345');

    expect(Buffer.from((await getObjectBytes('generated/u_1/a.pdf', 5)) as Uint8Array).toString()).toBe('12345');
    await expect(getObjectBytes('generated/u_1/a.pdf', 4)).rejects.toBeInstanceOf(RangeError);
    await expect(getObjectBytes('generated/u_1/missing.pdf')).resolves.toBeNull();
  });

  it('lists every page of a prefix with parsed metadata', async () => {
    for (let index = 0; index < 1005; index += 1) {
      bucket.seed(`generated/u_1/${String(index).padStart(4, '0')}.pdf`, 'x', { retention: '7d', type: 'bulk' });
    }
    bucket.seed('temp_images/u_1/t.png', 'x');
    const list = jest.spyOn(bucket, 'list');

    const objects = await listObjects('generated/');

    expect(objects).toHaveLength(1005);
    expect(list).toHaveBeenCalledTimes(2);
    expect(objects[0]).toMatchObject({ key: 'generated/u_1/0000.pdf', size: 1, metadata: { retention: '7d', type: 'bulk' } });
    expect(objects.every(object => object.key.startsWith('generated/'))).toBe(true);
  });

  it('deletes keys in batches of at most 1000', async () => {
    const keys = Array.from({ length: 1500 }, (_, index) => `generated/u_1/${index}.pdf`);
    keys.forEach(key => bucket.seed(key, 'x'));
    const del = jest.spyOn(bucket, 'delete');

    await deleteObjectKeys(keys);

    expect(del).toHaveBeenCalledTimes(2);
    expect((del.mock.calls[0][0] as string[]).length).toBe(1000);
    expect(bucket.objects.size).toBe(0);
  });

  it('marks an object as emailed, keeping its body, type and creation date', async () => {
    bucket.seed(
      'generated/u_1/certificates_1.pdf',
      '%PDF-1.4',
      { type: 'bulk', retention: '7d', created: '2026-01-01T00:00:00.000Z', emailsent: 'false' },
      'application/pdf'
    );

    await expect(markObjectAsEmailed('generated/u_1/certificates_1.pdf')).resolves.toBe(true);
    await expect(markObjectAsEmailed('generated/u_1/missing.pdf')).resolves.toBe(false);

    const stored = bucket.objects.get('generated/u_1/certificates_1.pdf');
    expect(stored?.customMetadata).toMatchObject({
      type: 'bulk',
      retention: '90d',
      emailsent: 'true',
      created: '2026-01-01T00:00:00.000Z',
    });
    expect(stored?.httpMetadata.contentType).toBe('application/pdf');
    expect(Buffer.from(stored?.data ?? []).toString()).toBe('%PDF-1.4');
  });

  it('gives an emailed object without stored metadata a creation date', async () => {
    bucket.seed('generated/u_1/individual_1/old.pdf', '%PDF-1.4', {}, 'application/pdf');

    await expect(markObjectAsEmailed('generated/u_1/individual_1/old.pdf')).resolves.toBe(true);

    const stored = bucket.objects.get('generated/u_1/individual_1/old.pdf');
    expect(stored?.customMetadata).toMatchObject({ type: 'individual', retention: '90d', emailsent: 'true' });
    expect(stored?.customMetadata.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  describe('cleanupExpiredFiles', () => {
    beforeEach(() => {
      const created = (ageDays: number) => new Date(Date.now() - ageDays * DAY_MS).toISOString();
      bucket.seed('generated/u_1/certificates_old.pdf', 'x', { retention: '7d', created: created(8) });
      bucket.seed('generated/u_1/certificates_new.pdf', 'x', { retention: '7d', created: created(2) });
      bucket.seed('generated/u_1/preview_old.pdf', 'x', { retention: '24h', created: created(2) });
      bucket.seed('generated/u_1/emailed.pdf', 'x', { retention: '7d', created: created(30), emailsent: 'true' });
      bucket.seed('temp_images/u_1/template.png', 'x', { retention: 'permanent', created: created(400) });
      bucket.seed('generated/u_1/no-metadata.pdf', 'x');
    });

    it('reports expired objects without deleting them on a dry run', async () => {
      const result = await cleanupExpiredFiles({ dryRun: true });

      expect(result.deleted.sort()).toEqual(['generated/u_1/certificates_old.pdf', 'generated/u_1/preview_old.pdf']);
      expect(bucket.objects.size).toBe(6);
    });

    it('deletes only expired, un-emailed objects', async () => {
      const result = await cleanupExpiredFiles();

      expect(result).toEqual({
        deleted: expect.arrayContaining(['generated/u_1/certificates_old.pdf', 'generated/u_1/preview_old.pdf']),
        errors: [],
      });
      expect([...bucket.objects.keys()].sort()).toEqual([
        'generated/u_1/certificates_new.pdf',
        'generated/u_1/emailed.pdf',
        'generated/u_1/no-metadata.pdf',
        'temp_images/u_1/template.png',
      ]);
    });

    it('reports a failed delete as an error and carries on', async () => {
      const realDelete = bucket.delete.bind(bucket);
      jest.spyOn(bucket, 'delete').mockImplementation(async keys => {
        if (keys === 'generated/u_1/preview_old.pdf') throw new Error('R2 down');
        return realDelete(keys);
      });
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      jest.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await cleanupExpiredFiles();

      expect(result).toEqual({
        deleted: ['generated/u_1/certificates_old.pdf'],
        errors: ['generated/u_1/preview_old.pdf'],
      });
    });
  });
});
