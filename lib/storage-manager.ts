import path from 'path';
import { deleteObject, deleteObjectKeys, listObjects } from '@/lib/storage/bucket';

export type StorageProvider = 'cloudflare-r2';

export type StorageItem = {
  key: string;             // e.g. generated/xyz.pdf or temp_images/u_1/img.png
  size: number;            // in bytes
  lastModified?: string;   // ISO string
};

export function getProvider(): StorageProvider {
  return 'cloudflare-r2';
}

export function ensureSafeStorageKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.includes('\\') || key.includes('\0')) return false;
  if (!key.startsWith('generated/') && !key.startsWith('temp_images/')) return false;
  return path.posix.normalize(key) === key;
}

// The namespace roots themselves are never valid deletion targets: a prefix
// delete on one would wipe the entire namespace, far more than any UI
// selection represents. Only canonical descendants may be deleted.
export function isProtectedStorageRoot(key: string): boolean {
  return key === 'generated/' || key === 'temp_images/';
}

export async function listAllObjects(prefix?: string): Promise<StorageItem[]> {
  const files = await listObjects(prefix);
  return files
    .filter(f => ensureSafeStorageKey(f.key))
    .map(f => ({ key: f.key, size: f.size || 0, lastModified: f.lastModified?.toISOString() }));
}

export async function deleteObjects(actions: Array<{ key?: unknown; isPrefix?: unknown }>): Promise<{ deleted: string[]; errors: string[] }>{
  const deleted: string[] = [];
  const errors: string[] = [];

  const safeActions = actions.filter((a): a is { key: string; isPrefix?: boolean } => {
    if (
      a &&
      ensureSafeStorageKey(a.key) &&
      !isProtectedStorageRoot(a.key) &&
      (a.isPrefix === undefined || typeof a.isPrefix === 'boolean')
    ) return true;
    errors.push(a && typeof a.key === 'string' ? a.key : '<invalid key>');
    return false;
  });

  for (const a of safeActions) {
    try {
      if (a.isPrefix) {
        // A prefix names a folder, so `generated/u_1` must not also match
        // `generated/u_10/...`.
        const prefix = a.key.endsWith('/') ? a.key : `${a.key}/`;
        const files = await listObjects(prefix);
        const keys: string[] = [];
        for (const f of files) {
          if (!ensureSafeStorageKey(f.key) || !f.key.startsWith(prefix)) {
            errors.push(String(f.key));
            continue;
          }
          keys.push(f.key);
        }
        await deleteObjectKeys(keys);
        deleted.push(...keys);
      } else {
        await deleteObject(a.key);
        deleted.push(a.key);
      }
    } catch {
      errors.push(`${a.key}`);
    }
  }

  return { deleted, errors };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${sizes[i]}`;
}
