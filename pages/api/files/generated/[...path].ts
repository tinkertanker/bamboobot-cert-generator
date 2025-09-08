import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import storageConfig from '@/lib/storage-config';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getPublicUrl as getR2SignedUrl } from '@/lib/r2-client';
import { getS3SignedUrl } from '@/lib/s3-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for local serving and signed URL issuance
  const session = await requireAuth(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { path: filePath } = req.query;
  
  if (!filePath || !Array.isArray(filePath)) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  // Join the path segments
  const relativePath = filePath.join('/');
  
  try {
    // Check if we're using cloud storage
    if (storageConfig.isR2Enabled) {
      // For R2, generate a signed URL and redirect
      const key = `generated/${relativePath}`;
      const signedUrl = await getR2SignedUrl(key);
      res.redirect(302, signedUrl);
      return;
    }
    
    if (storageConfig.isS3Enabled) {
      // For S3, generate a signed URL and redirect
      const key = `generated/${relativePath}`;
      const signedUrl = await getS3SignedUrl(key);
      res.redirect(302, signedUrl);
      return;
    }
    
    // For local storage, serve from filesystem
    const fullPath = path.join(process.cwd(), 'public', 'generated', relativePath);
    
    // Security check - ensure the file is within the generated directory
    const normalizedPath = path.normalize(fullPath);
    const generatedDir = path.join(process.cwd(), 'public', 'generated');
    if (!normalizedPath.startsWith(generatedDir)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const fileBuffer = fs.readFileSync(fullPath);
    const filename = path.basename(relativePath);
    const mimeType = lookup(filename) || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Error serving file' });
    return;
  }
}
