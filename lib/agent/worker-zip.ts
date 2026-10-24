import { createHash } from 'crypto';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import archiver from 'archiver';
import type { R2Bucket, R2UploadedPart } from '@cloudflare/workers-types';
import type { Artifact } from './jobs';
import { AgentError } from './input';

/** ZIP STORE plus multipart R2 bounds memory independently of batch size. */
export async function writeWorkerZip(bucket: R2Bucket, key: string, files: Array<Artifact & { objectKey: string }>, manifest: unknown, maxBytes: number) {
  const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: 'application/zip' } });
  const archive = archiver('zip', { store: true });
  const hash = createHash('sha256');
  let size = 0;
  const parts: R2UploadedPart[] = [];
  const blockSize = 5 * 1024 * 1024;
  let block = Buffer.allocUnsafe(blockSize);
  let used = 0;
  archive.on('warning', error => archive.destroy(error));
  // Each generator opens its object only when archiver consumes it. Never
  // retain 500 R2 bodies/connections or buffer the entire archive in memory.
  async function* verified(file: Artifact & { objectKey: string }) {
    const object = await bucket.get(file.objectKey);
    if (!object || object.size !== file.size) throw new AgentError('Certificate object missing or changed; batch not published');
    const expected = createHash('sha256');
    for await (const chunk of Readable.fromWeb(object.body as unknown as ReadableStream)) {
      expected.update(chunk);
      yield chunk;
    }
    if (expected.digest('hex') !== file.sha256) throw new AgentError('Certificate hash mismatch; batch not published');
  }
  for (const file of files) {
    const input = Readable.from(verified(file));
    input.on('error', error => archive.destroy(error));
    archive.append(input, { name: file.filename });
  }
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  const finalizing = archive.finalize();
  finalizing.catch(error => archive.destroy(error));
  try {
    for await (const chunk of archive) {
      const data = Buffer.from(chunk);
      size += data.length;
      if (size > maxBytes) throw new AgentError('ZIP exceeds batch artifact limit');
      hash.update(data);
      for (let offset = 0; offset < data.length;) {
        const take = Math.min(data.length - offset, blockSize - used);
        data.copy(block, used, offset, offset + take);
        offset += take;
        used += take;
        if (used === blockSize) {
          parts.push(await upload.uploadPart(parts.length + 1, block));
          block = Buffer.allocUnsafe(blockSize);
          used = 0;
        }
      }
    }
    await finalizing;
    if (used) parts.push(await upload.uploadPart(parts.length + 1, block.subarray(0, used)));
    await upload.complete(parts);
    return { filename: 'certificates.zip', size, sha256: hash.digest('hex') };
  } catch (error) {
    archive.abort();
    archive.destroy();
    // archiver's finalize promise can remain pending after a source error.
    // Its rejection is already observed above; waiting here would strand the
    // durable job instead of recording the failure and aborting multipart R2.
    await upload.abort().catch(() => undefined);
    throw error;
  }
}
