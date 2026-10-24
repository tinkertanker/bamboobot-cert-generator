// Read-only recovery via the same authenticated R2 object API used by Wrangler.
// No S3 credentials, public bucket URL, remote write or deletion is involved.
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { setTimeout: sleep } = require('node:timers/promises');

async function backupR2({ account, bucket, destination, token, fetcher = fetch, onProgress = () => {} }) {
  if (!account || !bucket || !destination || !token) {
    throw new Error('Explicit account, bucket, destination and CLOUDFLARE_API_TOKEN are required');
  }
  // Refuse to reuse a directory: a failed/partial backup cannot look complete.
  await fs.mkdir(destination, { mode: 0o700 });
  await fs.chmod(destination, 0o700);
  await fs.mkdir(path.join(destination, 'objects'), { mode: 0o700 });
  const root = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/${encodeURIComponent(bucket)}/objects`;
  const startedAt = new Date().toISOString();

  async function get(url) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(String(url), {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120000),
        redirect: 'error',
      });
      if (response.ok) return response;
      const status = response.status;
      await response.body?.cancel();
      if (attempt >= 7 || (status !== 429 && status < 500)) {
        throw new Error(`R2 backup GET failed (HTTP ${status}); no credentials or object keys logged`);
      }
      await sleep(Math.max(1000 * 2 ** attempt, Number(response.headers.get('retry-after') || 0) * 1000));
    }
  }

  async function inventory() {
    const objects = [];
    const seenCursors = new Set();
    let cursor;
    do {
      const url = new URL(root);
      url.searchParams.set('per_page', '1000');
      if (cursor) url.searchParams.set('cursor', cursor);
      const page = await (await get(url)).json();
      if (!page.success || !Array.isArray(page.result)) throw new Error('Invalid R2 inventory response');
      objects.push(...page.result);
      cursor = page.result_info?.is_truncated ? page.result_info.cursor : undefined;
      if (page.result_info?.is_truncated && (!cursor || seenCursors.has(cursor))) {
        throw new Error('R2 inventory pagination did not advance');
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    const keys = new Set();
    for (const object of objects) {
      if (typeof object.key !== 'string' || !Number.isSafeInteger(object.size) || object.size < 0 || !object.etag || keys.has(object.key)) {
        throw new Error('Invalid or duplicate object in R2 inventory');
      }
      keys.add(object.key);
    }
    return objects.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }

  const objects = await inventory();
  await fs.writeFile(path.join(destination, 'inventory-before.json'), JSON.stringify(objects, null, 2), { mode: 0o600, flag: 'wx' });
  let nextIndex = 0;
  let completed = 0;
  // Small, bounded concurrency; API rate limits are retried only for safe GETs.
  const workers = Array.from({ length: Math.min(4, objects.length) }, async () => {
    while (nextIndex < objects.length) {
      const object = objects[nextIndex++];
      const response = await get(`${root}/${encodeURIComponent(object.key)}`);
      const etag = response.headers.get('etag')?.replace(/^"|"$/g, '');
      if (etag !== object.etag.replace(/^"|"$/g, '')) {
        await response.body?.cancel();
        throw new Error('Object changed after inventory');
      }
      // Use a digest filename, never an untrusted object key as a local path.
      const file = `objects/${createHash('sha256').update(object.key).digest('hex')}`;
      const target = path.join(destination, file);
      const handle = await fs.open(target, 'wx', 0o600);
      const sha256 = createHash('sha256');
      const md5 = createHash('md5');
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > object.size) throw new Error('R2 object exceeds inventoried size');
          sha256.update(chunk);
          md5.update(chunk);
          await handle.writeFile(chunk);
        }
      } finally {
        await handle.close();
      }
      if (size !== object.size) throw new Error('R2 object size mismatch');
      // Multipart ETags are not MD5s; preserve those verbatim in the manifest.
      if (/^[a-f0-9]{32}$/i.test(etag) && md5.digest('hex') !== etag.toLowerCase()) {
        throw new Error('R2 object MD5 does not match its ETag');
      }
      const digest = sha256.digest('hex');
      const readback = createHash('sha256');
      for await (const chunk of require('node:fs').createReadStream(target)) readback.update(chunk);
      if (readback.digest('hex') !== digest) throw new Error('Local backup read-back checksum mismatch');
      object.file = file;
      object.sha256 = digest;
      completed++;
      if (completed % 100 === 0 || completed === objects.length) onProgress({ completed, total: objects.length });
    }
  });
  const results = await Promise.allSettled(workers);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;

  const after = await inventory();
  // Include HTTP/custom metadata, not just content hashes, in the stability check.
  const before = objects.map(({ file, sha256, ...object }) => object);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Bucket changed during backup; manifest not certified');
  const result = {
    account, bucket, startedAt, finishedAt: new Date().toISOString(), verified: true,
    count: objects.length, bytes: objects.reduce((sum, object) => sum + object.size, 0),
  };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ ...result, objects }, null, 2), { mode: 0o600, flag: 'wx' });
  return result;
}

module.exports = { backupR2 };

if (require.main === module) {
  const { values } = parseArgs({ options: { account: { type: 'string' }, bucket: { type: 'string' }, destination: { type: 'string' } } });
  backupR2({ ...values, token: process.env.CLOUDFLARE_API_TOKEN, onProgress: progress => console.log(JSON.stringify(progress)) })
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('R2 backup failed. Private partial data retained; do not treat it as a verified backup.'); process.exitCode = 1; });
}
