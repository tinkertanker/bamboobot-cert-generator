import fs from 'fs';
import path from 'path';
import storageConfig from './storage-config';
import { listFiles as listR2Files, deleteFromR2 } from './r2-client';
import { listAllS3Objects, deleteFromS3 } from './s3-client';
import { getGeneratedDir, getLocalStorageDir, getTempImagesDir, resolvePathWithin } from './paths';

export type StorageProvider = 'local' | 'cloudflare-r2' | 'amazon-s3';

export type StorageItem = {
  key: string;             // e.g. generated/xyz.pdf or temp_images/u_1/img.png
  size: number;            // in bytes
  lastModified?: string;   // ISO string
};

export function getProvider(): StorageProvider {
  const p = process.env.STORAGE_PROVIDER || 'local';
  if (p === 'cloudflare-r2') return 'cloudflare-r2';
  if (p === 'amazon-s3') return 'amazon-s3';
  return 'local';
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

function isWithinRealStorage(candidate: string, allowBase = false): boolean {
  const realBase = fs.realpathSync(getLocalStorageDir());
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realBase, realCandidate);
  return (allowBase || !!relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// A canonical key can still resolve onto a namespace root when an in-storage
// symlink is used as an intermediate path component (e.g.
// `generated/<link-to-base>/temp_images`). The lexical isProtectedStorageRoot
// guard cannot see that, so recursive deletes must also reject any path that
// lands on the storage base or a namespace root. Identity is compared by
// device + inode rather than by resolved path string: on case-insensitive
// filesystems (macOS APFS) a case-variant final component such as
// `Temp_Images` realpaths to a differently-cased string yet points at the
// same directory, which a string comparison would miss.
function resolvesToProtectedRoot(candidate: string): boolean {
  let target: fs.Stats;
  try {
    target = fs.statSync(candidate);
  } catch {
    return false;
  }
  return [getLocalStorageDir(), getGeneratedDir(), getTempImagesDir()].some((root) => {
    try {
      const rootStat = fs.statSync(root);
      return rootStat.dev === target.dev && rootStat.ino === target.ino;
    } catch {
      return false;
    }
  });
}

function lstatIfPresent(candidate: string): fs.Stats | null {
  try {
    return fs.lstatSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Local helpers
function walkLocal(dir: string, basePrefix: string): StorageItem[] {
  if (!fs.existsSync(dir)) return [];
  const items: StorageItem[] = [];

  const stack: string[] = [dir];
  while (stack.length) {
    const current = stack.pop() as string;
    const entries = fs.readdirSync(current);
    for (const name of entries) {
      const full = path.join(current, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = path.relative(getLocalStorageDir(), full).replaceAll('\\', '/');
      items.push({
        key: `${rel}`,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
      });
    }
  }
  return items;
}

export async function listAllObjects(prefix?: string): Promise<StorageItem[]> {
  const provider = getProvider();

  if (provider === 'cloudflare-r2' && storageConfig.isR2Enabled) {
    const files = await listR2Files(prefix);
    return files
      .filter(f => f.key && ensureSafeStorageKey(f.key))
      .map(f => ({ key: f.key, size: f.size || 0, lastModified: f.lastModified?.toISOString() }));
  }

  if (provider === 'amazon-s3' && storageConfig.isS3Enabled) {
    const files = await listAllS3Objects(prefix);
    return files
      .filter(f => f.key && ensureSafeStorageKey(f.key))
      .map(f => ({ key: f.key, size: f.size || 0, lastModified: f.lastModified?.toISOString() }));
  }

  // Local
  const results: StorageItem[] = [];
  const genDir = getGeneratedDir();
  const tmpDir = getTempImagesDir();
  results.push(...walkLocal(genDir, 'generated/'));
  results.push(...walkLocal(tmpDir, 'temp_images/'));

  // Apply prefix filter if present
  return prefix ? results.filter(i => i.key.startsWith(prefix)) : results;
}

export async function deleteObjects(actions: Array<{ key?: unknown; isPrefix?: unknown }>): Promise<{ deleted: string[]; errors: string[] }>{
  const provider = getProvider();
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

  if (provider === 'cloudflare-r2' && storageConfig.isR2Enabled) {
    for (const a of safeActions) {
      try {
        if (a.isPrefix) {
          const files = await listR2Files(a.key);
          for (const f of files) {
            if (!ensureSafeStorageKey(f.key) || !f.key.startsWith(a.key)) {
              errors.push(String(f.key));
              continue;
            }
            await deleteFromR2(f.key);
            deleted.push(f.key);
          }
        } else {
          await deleteFromR2(a.key);
          deleted.push(a.key);
        }
      } catch (e) {
        errors.push(`${a.key}`);
      }
    }
    return { deleted, errors };
  }

  if (provider === 'amazon-s3' && storageConfig.isS3Enabled) {
    for (const a of safeActions) {
      try {
        if (a.isPrefix) {
          const files = await listAllS3Objects(a.key);
          for (const f of files) {
            if (!ensureSafeStorageKey(f.key) || !f.key.startsWith(a.key)) {
              errors.push(String(f.key));
              continue;
            }
            await deleteFromS3(f.key);
            deleted.push(f.key);
          }
        } else {
          await deleteFromS3(a.key);
          deleted.push(a.key);
        }
      } catch (e) {
        errors.push(`${a.key}`);
      }
    }
    return { deleted, errors };
  }

  // Local deletions
  for (const a of safeActions) {
    try {
      const full = resolvePathWithin(getLocalStorageDir(), a.key);
      if (!full) {
        errors.push(a.key);
        continue;
      }
      if (a.isPrefix) {
        // Delete everything under the directory
        const stat = lstatIfPresent(full);
        if (stat) {
          if (stat.isSymbolicLink()) {
            if (!isWithinRealStorage(path.dirname(full), true)) {
              errors.push(a.key);
              continue;
            }
            fs.unlinkSync(full);
            deleted.push(a.key);
            continue;
          }
          if (!isWithinRealStorage(full)) {
            errors.push(a.key);
            continue;
          }
          if (stat.isDirectory()) {
            // Refuse to recurse into the storage base or a namespace root,
            // even when a symlinked path component resolves onto one.
            if (resolvesToProtectedRoot(full)) {
              errors.push(a.key);
              continue;
            }
            // Recursively remove directory
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            // If prefix matches a file path start, find and delete matching files
            // Fallback: walk both roots and remove filtered
            const all = await listAllObjects(a.key);
            for (const f of all) {
              const abs = resolvePathWithin(getLocalStorageDir(), f.key);
              const listedStat = abs ? lstatIfPresent(abs) : null;
              if (abs && listedStat && !listedStat.isSymbolicLink() && isWithinRealStorage(abs)) {
                fs.rmSync(abs, { force: true });
                deleted.push(f.key);
              } else {
                errors.push(f.key);
              }
            }
            continue;
          }
          deleted.push(a.key);
        }
      } else {
        const stat = lstatIfPresent(full);
        if (stat) {
          const contained = stat.isSymbolicLink()
            ? isWithinRealStorage(path.dirname(full), true)
            : isWithinRealStorage(full);
          if (!contained) {
            errors.push(a.key);
            continue;
          }
          if (stat.isSymbolicLink()) {
            fs.unlinkSync(full);
          } else {
            fs.rmSync(full, { force: true });
          }
          deleted.push(a.key);
        }
      }
    } catch (e) {
      errors.push(`${a.key}`);
    }
  }

  return { deleted, errors };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${sizes[i]}`;
}
