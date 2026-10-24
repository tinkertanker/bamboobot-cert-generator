import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { getTempImagesDir, getGeneratedDir } from '@/lib/paths';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier } from '@/lib/server/tiers';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';
import { isWorkers } from '@/lib/server/cloudflare';
import { listAllObjects } from '@/lib/storage-manager';

interface FileInfo {
  name: string;
  size: number;
  age: number;
  type: 'pdf' | 'image' | 'progressive' | 'other';
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
    dockerData?: DirectoryStats;
  };
}


function getAgeInDays(mtime: Date): number {
  const diffTime = Math.abs(Date.now() - mtime.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getFileType(filename: string): FileInfo['type'] {
  const ext = path.extname(filename).toLowerCase();
  if (filename.startsWith('progressive_pdf-')) return 'progressive';
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  return 'other';
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

// Async (non-blocking) directory walk: storage can hold thousands of files and a
// synchronous scan would stall every other request on this server while it runs.
async function analyzeDirectory(dirPath: string): Promise<DirectoryStats> {
  let items: string[];
  try {
    items = await fsPromises.readdir(dirPath);
  } catch (err) {
    if (!isMissing(err)) throw err;
    return {
      path: dirPath,
      totalSize: 0,
      fileCount: 0,
      files: []
    };
  }

  const files: FileInfo[] = [];
  let totalSize = 0;
  let fileCount = 0;

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    
    let stats: fs.Stats;
    try {
      stats = await fsPromises.stat(itemPath);
    } catch {
      // File may have been deleted between readdir and stat; skip this item
      continue;
    }

    if (stats.isFile()) {
      files.push({
        name: item,
        size: stats.size,
        age: getAgeInDays(stats.mtime),
        type: getFileType(item)
      });
      totalSize += stats.size;
      fileCount++;
    } else if (stats.isDirectory()) {
      // For directories (like progressive PDF folders), get the total size
      const subDirSize = await getDirSize(itemPath);
      files.push({
        name: item,
        size: subDirSize,
        age: getAgeInDays(stats.mtime),
        type: getFileType(item)
      });
      totalSize += subDirSize;
      fileCount++;
    }
  }

  // Sort files by size (largest first)
  files.sort((a, b) => b.size - a.size);

  return {
    path: dirPath,
    totalSize,
    fileCount,
    files
  };
}

async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  
  let items: string[];
  try {
    items = await fsPromises.readdir(dirPath);
  } catch (err) {
    if (isMissing(err)) return 0;
    throw err;
  }
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    let stats;
    try {
      stats = await fsPromises.stat(itemPath);
    } catch (err) {
      // Entry was deleted between readdir and stat
      if (isMissing(err)) continue;
      throw err;
    }
    
    if (stats.isFile()) {
      size += stats.size;
    } else if (stats.isDirectory()) {
      size += await getDirSize(itemPath);
    }
  }
  
  return size;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This endpoint discloses filesystem storage details. Allow unauthenticated
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
    if (isWorkers) {
      const generated: DirectoryStats = { path: 'R2:generated/', totalSize: 0, fileCount: 0, files: [] };
      const tempImages: DirectoryStats = { path: 'R2:temp_images/', totalSize: 0, fileCount: 0, files: [] };
      for (const object of await listAllObjects()) {
        const isGenerated = object.key.startsWith('generated/');
        const directory = isGenerated ? generated : tempImages;
        const prefix = isGenerated ? 'generated/' : 'temp_images/';
        directory.totalSize += object.size;
        directory.fileCount += 1;
        directory.files.push({ name: object.key.slice(prefix.length), size: object.size,
          age: object.lastModified ? getAgeInDays(new Date(object.lastModified)) : 0,
          type: getFileType(path.basename(object.key)) });
      }
      generated.files.sort((a, b) => b.size - a.size);
      tempImages.files.sort((a, b) => b.size - a.size);
      res.status(200).json({ totalSize: generated.totalSize + tempImages.totalSize,
        directories: { generated, tempImages } } satisfies StorageStats);
      return;
    }
    const generatedDir = getGeneratedDir();
    const tempImagesDir = getTempImagesDir();
    const dockerDataDir = path.join(process.cwd(), 'data');

    const dockerDataExists = await fsPromises.stat(dockerDataDir).then(() => true, () => false);
    const [generated, tempImages, dockerData] = await Promise.all([
      analyzeDirectory(generatedDir),
      analyzeDirectory(tempImagesDir),
      dockerDataExists ? analyzeDirectory(dockerDataDir) : undefined,
    ]);
    const directories = {
      generated,
      tempImages,
      ...(dockerData && { dockerData })
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
