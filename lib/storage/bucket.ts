/**
 * File storage on the Cloudflare R2 bucket bound as FILES.
 *
 * Keys are `temp_images/u_<userId>/...` for uploaded templates,
 * `generated/u_<userId>/...` for generated PDFs and `email_queue/...` for
 * attachments waiting in a bulk email queue. Objects are never public: API
 * routes check access and stream them through the Worker.
 */
import { getEnv } from '@/lib/cloudflare/env';
import { cleanupExpiredObjects } from './expiry-cleanup';
import { readFileMetadata, type FileMetadata } from './file-metadata';
import type { R2Bucket, R2Object, R2ObjectBody } from '@/lib/cloudflare/types';

export type { FileMetadata } from './file-metadata';

export interface StoredObjectInfo {
  key: string;
  size: number;
  lastModified?: Date;
  metadata: FileMetadata | null;
}

export function getBucket(): R2Bucket {
  const bucket = getEnv().FILES;
  if (!bucket) throw new Error('The FILES (R2) binding is not configured');
  return bucket;
}

/** Retention defaults inferred from the key, as the earlier S3 client did. */
export function inferRetention(key: string): Pick<FileMetadata, 'type' | 'retention'> {
  // Attachments waiting in a bulk email queue. Sent ones are deleted at once.
  if (key.startsWith('email_queue/')) return { type: 'preview', retention: '7d' };
  if (key.includes('/individual_')) return { type: 'individual', retention: '90d' };
  if (key.includes('certificates_') && key.endsWith('.pdf')) return { type: 'bulk', retention: '7d' };
  if (key.includes('/preview_') || key.includes('/temp_')) return { type: 'preview', retention: '24h' };
  return { type: 'template', retention: 'permanent' };
}

function toCustomMetadata(metadata: FileMetadata): Record<string, string> {
  // Stored lowercased so readFileMetadata parses them the same way as
  // objects written through the S3 API before the move.
  const out: Record<string, string> = {
    type: metadata.type,
    created: metadata.created,
    retention: metadata.retention,
    emailsent: metadata.emailSent ?? 'false',
    downloadcount: metadata.downloadCount ?? '0',
  };
  return out;
}

export async function putObject(
  key: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream | string,
  options: { contentType?: string; metadata?: Partial<FileMetadata> } = {}
): Promise<void> {
  const inferred = inferRetention(key);
  const metadata: FileMetadata = {
    type: options.metadata?.type ?? inferred.type,
    retention: options.metadata?.retention ?? inferred.retention,
    created: options.metadata?.created ?? new Date().toISOString(),
    emailSent: options.metadata?.emailSent ?? 'false',
    downloadCount: options.metadata?.downloadCount ?? '0',
  };
  await getBucket().put(key, body as Parameters<R2Bucket['put']>[1], {
    httpMetadata: { contentType: options.contentType ?? 'application/octet-stream' },
    customMetadata: toCustomMetadata(metadata),
  });
}

export async function getObject(key: string): Promise<R2ObjectBody | null> {
  return getBucket().get(key);
}

export async function getObjectBytes(key: string, maxBytes?: number): Promise<Uint8Array | null> {
  const object = await getBucket().get(key);
  if (!object) return null;
  if (maxBytes !== undefined && object.size > maxBytes) {
    await object.body.cancel().catch(() => undefined);
    throw new RangeError('Stored object exceeds the size limit');
  }
  return new Uint8Array(await object.arrayBuffer());
}

export async function headObject(key: string): Promise<R2Object | null> {
  return getBucket().head(key);
}

export async function deleteObject(key: string): Promise<void> {
  await getBucket().delete(key);
}

/** R2 deletes at most 1000 keys per call. */
export async function deleteObjectKeys(keys: string[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    await getBucket().delete(keys.slice(offset, offset + 1000));
  }
}

export async function listObjects(prefix?: string): Promise<StoredObjectInfo[]> {
  const bucket = getBucket();
  const items: StoredObjectInfo[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      items.push({
        key: object.key,
        size: object.size,
        lastModified: object.uploaded,
        metadata: readFileMetadata(object.customMetadata),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return items;
}

/** Extend an emailed file's retention to 90 days by rewriting its metadata. */
export async function markObjectAsEmailed(key: string): Promise<boolean> {
  const bucket = getBucket();
  const object = await bucket.get(key);
  if (!object) return false;
  // R2 returns {} for objects stored without custom metadata.
  const stored = object.customMetadata && Object.keys(object.customMetadata).length > 0
    ? readFileMetadata(object.customMetadata)
    : null;
  const current = stored ?? { ...inferRetention(key), created: object.uploaded.toISOString() };
  if (!current.created) current.created = object.uploaded.toISOString();
  await bucket.put(key, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: toCustomMetadata({ ...current, emailSent: 'true', retention: '90d' }),
  });
  return true;
}

/** Delete objects whose retention has passed (see expiry-cleanup.ts). */
export async function cleanupExpiredFiles(
  options: { dryRun?: boolean } = {}
): Promise<{ deleted: string[]; errors: string[] }> {
  const files = await listObjects();
  const metadataByKey = new Map(files.map(file => [file.key, file.metadata]));
  return cleanupExpiredObjects(
    files,
    {
      getMetadata: async key => metadataByKey.get(key) ?? null,
      deleteObject,
      dryRun: options.dryRun,
    }
  );
}
