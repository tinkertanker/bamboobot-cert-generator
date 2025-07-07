import type { NextApiRequest, NextApiResponse } from 'next';
import { cleanupExpiredFiles as cleanupR2, isR2Configured } from '@/lib/r2-client';
import { cleanupExpiredS3Files, isS3Configured } from '@/lib/s3-client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check storage provider
  const storageProvider = process.env.STORAGE_PROVIDER || 'local';
  
  if (storageProvider === 'local') {
    return res.status(400).json({ error: 'Local storage does not support cleanup' });
  }

  // Optional: Add authentication here
  // For now, check for a secret key in headers
  const authKey = req.headers['x-cleanup-key'];
  if (authKey !== process.env.CLEANUP_SECRET_KEY && process.env.CLEANUP_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let result;
    
    if (storageProvider === 'cloudflare-r2' && isR2Configured()) {
      console.log('Starting R2 cleanup process...');
      result = await cleanupR2();
    } else if (storageProvider === 'amazon-s3' && isS3Configured()) {
      console.log('Starting S3 cleanup process...');
      result = await cleanupExpiredS3Files();
    } else {
      return res.status(400).json({ 
        error: `Storage provider ${storageProvider} is not properly configured` 
      });
    }
    
    console.log(`Cleanup complete. Deleted ${result.deleted.length} files.`);
    if (result.errors.length > 0) {
      console.error(`Errors processing ${result.errors.length} files.`);
    }

    return res.status(200).json({
      success: true,
      storageProvider,
      deletedCount: result.deleted.length,
      deleted: result.deleted,
      errorCount: result.errors.length,
      errors: result.errors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cleanup failed:', error);
    return res.status(500).json({ 
      error: 'Cleanup failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}