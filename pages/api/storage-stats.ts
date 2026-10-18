import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier } from '@/lib/server/tiers';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';
import { listObjects, type StoredObjectInfo } from '@/lib/storage/bucket';

interface FileInfo {
  name: string;
  size: number;
  age: number;
  type: 'pdf' | 'image' | 'folder' | 'other';
}

interface DirectoryStats {
  path: string;
  totalSize: number;
  fileCount: number;
  files: FileInfo[];
}

interface StorageStats {
  totalSize: number;
  directories: {
    generated: DirectoryStats;
    tempImages: DirectoryStats;
  };
}

function getAgeInDays(date: Date | undefined): number {
  if (!date) return 0;
  const diffTime = Math.abs(Date.now() - date.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getFileType(filename: string): FileInfo['type'] {
  const ext = path.posix.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  return 'other';
}

/** Summarise one namespace (`generated/` or `temp_images/`) by its first-level entries. */
function summarise(prefix: string, objects: StoredObjectInfo[]): DirectoryStats {
  const entries = new Map<string, { size: number; newest?: Date; isFolder: boolean }>();
  let totalSize = 0;
  for (const object of objects) {
    const rest = object.key.slice(prefix.length);
    const slash = rest.indexOf('/');
    const name = slash === -1 ? rest : rest.slice(0, slash);
    const entry = entries.get(name) ?? { size: 0, isFolder: slash !== -1 };
    entry.size += object.size;
    if (object.lastModified && (!entry.newest || object.lastModified > entry.newest)) entry.newest = object.lastModified;
    entries.set(name, entry);
    totalSize += object.size;
  }
  const files: FileInfo[] = Array.from(entries, ([name, entry]) => ({
    name,
    size: entry.size,
    age: getAgeInDays(entry.newest),
    type: entry.isFolder ? 'folder' : getFileType(name)
  })).sort((a, b) => b.size - a.size);
  return { path: prefix, totalSize, fileCount: files.length, files };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This endpoint discloses storage details. Allow unauthenticated
  // access ONLY in a local development setup that is not enforcing
  // authentication (the app's open dev mode, where the in-app StorageMonitor
  // tool runs without a session). In every other case — any deployment that
  // enforces auth, and any non-development environment — require a valid
  // session, and super admin outside development.
  // getServerSession validates JWT token expiry and signature internally.
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isAuthenticationRequired() || !isDevelopment) {
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user || !session.user.email || !session.user.id) {
      res.status(401).json({ error: 'Unauthorized - valid session required' });
      return;
    }
    if (!isDevelopment) {
      const userTier = detectUserTier(session.user.email);
      if (userTier !== 'super_admin') {
        res.status(403).json({ error: 'Only available for super admins in production' });
        return;
      }
    }
  }

  try {
    const [generatedObjects, tempImageObjects] = await Promise.all([
      listObjects('generated/'),
      listObjects('temp_images/'),
    ]);
    const directories = {
      generated: summarise('generated/', generatedObjects),
      tempImages: summarise('temp_images/', tempImageObjects),
    };

    const totalSize = Object.values(directories).reduce((sum, dir) => sum + dir.totalSize, 0);

    const stats: StorageStats = {
      totalSize,
      directories
    };

    res.status(200).json(stats);
    return;
  } catch (error) {
    console.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
    return;
  }
}
