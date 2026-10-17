/**
 * Retention-based cleanup shared by the S3-compatible providers (Cloudflare R2
 * and Amazon S3). Each object carries `retention` and `created` metadata set at
 * upload time; this module decides which objects have expired and deletes them.
 */
import type { FileMetadata } from './file-metadata';

const HOUR_MS = 60 * 60 * 1000;

const RETENTION_HOURS: Record<FileMetadata['retention'], number> = {
  '24h': 24,
  '7d': 7 * 24,
  '90d': 90 * 24,
  permanent: Infinity,
};

export const DEFAULT_CLEANUP_CONCURRENCY = 8;

/**
 * True when an object's retention period has passed. Emailed files are kept,
 * and objects with a missing or unparseable `created` date are never deleted.
 */
export function isExpired(metadata: FileMetadata, now: Date = new Date()): boolean {
  if (metadata.emailSent === 'true') return false;
  const created = new Date(metadata.created).getTime();
  if (Number.isNaN(created)) return false;
  const ageInHours = (now.getTime() - created) / HOUR_MS;
  return ageInHours > RETENTION_HOURS[metadata.retention];
}

export interface ExpiryCleanupOptions {
  getMetadata: (key: string) => Promise<FileMetadata | null>;
  deleteObject: (key: string) => Promise<void>;
  /** Report what would be deleted without deleting anything. */
  dryRun?: boolean;
  concurrency?: number;
  now?: Date;
}

/**
 * Check each listed object's metadata and delete the expired ones. Runs a
 * bounded number of HEAD/DELETE requests at once; results keep listing order.
 */
export async function cleanupExpiredObjects(
  files: ReadonlyArray<{ key: string }>,
  {
    getMetadata,
    deleteObject,
    dryRun = false,
    concurrency = DEFAULT_CLEANUP_CONCURRENCY,
    now = new Date(),
  }: ExpiryCleanupOptions
): Promise<{ deleted: string[]; errors: string[] }> {
  const outcomes: Array<'deleted' | 'error' | undefined> = new Array(files.length);

  const processFile = async (key: string, index: number): Promise<void> => {
    try {
      const metadata = await getMetadata(key);
      if (!metadata || !isExpired(metadata, now)) return;
      if (!dryRun) {
        await deleteObject(key);
        console.log(`Deleted expired file: ${key}`);
      }
      outcomes[index] = 'deleted';
    } catch (error) {
      console.error(`Error processing file ${key}:`, error);
      outcomes[index] = 'error';
    }
  };

  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < files.length) {
      const index = nextIndex++;
      await processFile(files[index].key, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), files.length) }, worker)
  );

  const deleted: string[] = [];
  const errors: string[] = [];
  files.forEach((file, index) => {
    if (outcomes[index] === 'deleted') deleted.push(file.key);
    else if (outcomes[index] === 'error') errors.push(file.key);
  });
  return { deleted, errors };
}
