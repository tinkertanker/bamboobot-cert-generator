import fs from 'fs';
import path from 'path';
import storageConfig from './storage-config';
import { listFiles as listR2Files, deleteFromR2 } from './r2-client';
import { listAllS3Objects, deleteFromS3 } from './s3-client';
import { getGeneratedDir, getTempImagesDir } from './paths';

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

function ensureSafeKey(key: string): boolean {
  // Only allow keys within our app namespaces
  return key.startsWith('generated/') || key.startsWith('temp_images/');
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
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = path.relative(path.join(process.cwd(), 'public'), full).replaceAll('\\', '/');
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
      .filter(f => f.key && ensureSafeKey(f.key))
      .map(f => ({ key: f.key, size: f.size || 0, lastModified: f.lastModified?.toISOString() }));
  }

  if (provider === 'amazon-s3' && storageConfig.isS3Enabled) {
    const files = await listAllS3Objects(prefix);
    return files
      .filter(f => f.key && ensureSafeKey(f.key))
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

export async function deleteObjects(actions: Array<{ key: string; isPrefix?: boolean }>): Promise<{ deleted: string[]; errors: string[] }>{
  const provider = getProvider();
  const deleted: string[] = [];
  const errors: string[] = [];

  const safeActions = actions.filter(a => ensureSafeKey(a.key));

  if (provider === 'cloudflare-r2' && storageConfig.isR2Enabled) {
    for (const a of safeActions) {
      try {
        if (a.isPrefix) {
          const files = await listR2Files(a.key);
          for (const f of files) {
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
      const full = path.join(process.cwd(), 'public', a.key);
      if (a.isPrefix) {
        // Delete everything under the directory
        if (fs.existsSync(full)) {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            // Recursively remove directory
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            // If prefix matches a file path start, find and delete matching files
            // Fallback: walk both roots and remove filtered
            const all = await listAllObjects(a.key);
            for (const f of all) {
              const abs = path.join(process.cwd(), 'public', f.key);
              if (fs.existsSync(abs)) fs.rmSync(abs, { force: true });
              deleted.push(f.key);
            }
            continue;
          }
          deleted.push(a.key);
        }
      } else {
        if (fs.existsSync(full)) {
          fs.rmSync(full, { force: true });
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

