/** @jest-environment node */
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';

const { backupR2 } = require('../../scripts/backup-r2');

describe('private R2 recovery backup', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'r2-backup-test-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  function bucket(changed = false, corrupt = false) {
    const body = Buffer.from('%PDF-1.7\nprivate certificate');
    const object = {
      key: 'generated/../../private name.pdf',
      size: body.length,
      etag: createHash('md5').update(body).digest('hex'),
      last_modified: '2026-10-19T12:00:00Z',
      custom_metadata: { retention: '90d' },
      http_metadata: { contentType: 'application/pdf' },
    };
    let listings = 0;
    const fetcher = async (url: string) => {
      if (new URL(url).pathname.endsWith('/objects')) {
        const cursor = new URL(url).searchParams.get('cursor');
        if (!cursor) listings++;
        return new Response(JSON.stringify({
          success: true,
          result: cursor ? [] : [{ ...object, etag: changed && listings > 1 ? 'changed' : object.etag }],
          result_info: { is_truncated: !cursor, cursor: cursor ? undefined : 'page-two' },
        }));
      }
      return new Response(corrupt ? body.subarray(1) : body, { headers: { etag: `"${object.etag}"` } });
    };
    return { body, object, fetcher };
  }

  it('preserves paginated objects and metadata privately without treating object keys as local paths', async () => {
    const { body, object, fetcher } = bucket();
    const destination = path.join(root, 'backup');
    const result = await backupR2({ account: 'account', bucket: 'bucket', destination, token: 'test-token', fetcher });
    expect(result).toMatchObject({ verified: true, count: 1, bytes: body.length });
    const manifest = JSON.parse(await readFile(path.join(destination, 'manifest.json'), 'utf8'));
    expect(manifest.objects[0]).toMatchObject({ ...object, sha256: createHash('sha256').update(body).digest('hex') });
    const stored = path.join(destination, manifest.objects[0].file);
    expect(await readFile(stored)).toEqual(body);
    expect((await stat(stored)).mode & 0o777).toBe(0o600);
    expect((await stat(destination)).mode & 0o777).toBe(0o700);
    expect(await readFile(path.join(destination, 'manifest.json'), 'utf8')).not.toContain('test-token');
    await expect(backupR2({ account: 'account', bucket: 'bucket', destination, token: 'test-token', fetcher })).rejects.toThrow();
  });

  it.each([
    ['bucket changed during backup', true, false],
    ['object body does not match inventory', false, true],
  ])('does not certify a backup when %s', async (_label, changed, corrupt) => {
    const { fetcher } = bucket(changed as boolean, corrupt as boolean);
    const destination = path.join(root, 'backup');
    await expect(backupR2({ account: 'account', bucket: 'bucket', destination, token: 'test-token', fetcher })).rejects.toThrow();
    await expect(stat(path.join(destination, 'manifest.json'))).rejects.toThrow();
  });
});
