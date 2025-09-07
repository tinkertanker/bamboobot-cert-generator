import type { NextApiRequest, NextApiResponse } from 'next';
import { cleanupExpiredFiles, isR2Configured } from '@/lib/r2-client';

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

  // Optional: Add authentication here
  // For now, check for a secret key in headers
  const authKey = req.headers['x-cleanup-key'];
  if (authKey !== process.env.CLEANUP_SECRET_KEY && process.env.CLEANUP_SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
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
