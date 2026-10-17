import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { cleanupExpiredFiles, isR2Configured } from '@/lib/r2-client';

function secretMatches(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  // Compare fixed-length digests so neither content nor length leaks via timing.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Check if R2 is configured
  if (!isR2Configured()) {
    res.status(400).json({ error: 'R2 storage is not configured' });
    return;
  }

  // Authentication check
  // Only allow access if CLEANUP_SECRET_KEY is set and matches
  const authKey = req.headers['x-cleanup-key'];
  if (process.env.CLEANUP_SECRET_KEY && !secretMatches(authKey, process.env.CLEANUP_SECRET_KEY)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  // If no secret key is configured, warn in development but block in production
  if (!process.env.CLEANUP_SECRET_KEY) {
    if (process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'Authentication not configured' });
      return;
    }
    console.warn('⚠️ WARNING: Authentication for the R2 cleanup endpoint is not configured and the endpoint is unprotected in development');
  }

  try {
    console.log('Starting R2 cleanup process...');
    const result = await cleanupExpiredFiles();
    
    console.log(`Cleanup complete. Deleted ${result.deleted.length} files.`);
    if (result.errors.length > 0) {
      console.error(`Errors processing ${result.errors.length} files.`);
    }

    res.status(200).json({
      success: true,
      deletedCount: result.deleted.length,
      deleted: result.deleted,
      errorCount: result.errors.length,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    console.error('Cleanup failed:', error);
    res.status(500).json({ 
      error: 'Cleanup failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
    return;
  }
}
