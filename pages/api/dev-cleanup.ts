import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier } from '@/lib/server/tiers';
import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';
import { formatBytes } from '@/lib/format';
import { deleteObjectKeys, listObjects } from '@/lib/storage/bucket';

interface CleanupResult {
  deletedFiles: number;
  freedSpace: number;
  deletedItems: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete objects under `prefix`, optionally only those older than
 * `olderThanDays` or matching `extensions` larger than 1 MB.
 */
async function cleanupPrefix(
  prefix: 'generated/' | 'temp_images/',
  olderThanDays?: number,
  largeExtensions?: string[]
): Promise<CleanupResult> {
  const now = Date.now();
  const objects = (await listObjects(prefix)).filter(object => {
    if (olderThanDays !== undefined) {
      if (!object.lastModified || now - object.lastModified.getTime() < olderThanDays * DAY_MS) return false;
    }
    if (largeExtensions) {
      const ext = path.posix.extname(object.key).toLowerCase().slice(1);
      if (!largeExtensions.includes(ext) || object.size <= 1024 * 1024) return false;
    }
    return true;
  });
  await deleteObjectKeys(objects.map(object => object.key));
  return {
    deletedFiles: objects.length,
    freedSpace: objects.reduce((total, object) => total + object.size, 0),
    deletedItems: objects.map(object => `${object.key} (${formatBytes(object.size)})`)
  };
}

function combine(...results: CleanupResult[]): CleanupResult {
  return {
    deletedFiles: results.reduce((total, result) => total + result.deletedFiles, 0),
    freedSpace: results.reduce((total, result) => total + result.freedSpace, 0),
    deletedItems: results.flatMap(result => result.deletedItems)
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // This endpoint performs destructive, unfiltered deletion of stored files.
  // Allow unauthenticated access ONLY in a local development setup that is not
  // enforcing authentication (the app's open dev mode, where the in-app
  // StorageMonitor tool runs without a session). In every other case — any
  // deployment that enforces auth, and any non-development environment —
  // require a valid session, and super admin outside development.
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
    const { target } = req.body;
    
    let result: CleanupResult;
    switch (target) {
      case 'all':
        result = combine(await cleanupPrefix('generated/'), await cleanupPrefix('temp_images/'));
        break;
      case 'generated':
        result = await cleanupPrefix('generated/');
        break;
      case 'temp':
      case 'tempImages':
        result = await cleanupPrefix('temp_images/');
        break;
      case 'old':
        // Old files: 7+ days for generated, 30+ days for temp images
        result = combine(await cleanupPrefix('generated/', 7), await cleanupPrefix('temp_images/', 30));
        break;
      case 'large-pdfs':
        result = await cleanupPrefix('generated/', undefined, ['pdf']);
        break;
      default:
        res.status(400).json({ error: 'Invalid target' });
        return;
    }

    res.status(200).json({
      success: true,
      ...result,
      message: `Deleted ${result.deletedFiles} items, freed ${formatBytes(result.freedSpace)}`
    });
    return;
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
    return;
  }
}
