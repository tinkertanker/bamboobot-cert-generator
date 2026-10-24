import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getTempImagesDir, resolvePathWithin } from '@/lib/paths';
import storageConfig from '@/lib/storage-config';
import { getPublicUrl as getR2SignedUrl } from '@/lib/r2-client';
import { getS3SignedUrl } from '@/lib/s3-client';
import { isWorkers } from '@/lib/server/cloudflare';
import { serveWorkerObject } from '@/lib/server/worker-files';

const SERVED_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

// Serve nested temp_images paths, e.g. temp_images/u_<userId>/<filename>
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const segments = req.query.path;
  if (!Array.isArray(segments) || segments.length < 2) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  // Enforce user folder prefix
  const expectedPrefix = `u_${userId}`;
  if (segments[0] !== expectedPrefix) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const relativePath = segments.join('/');
  if (
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.includes('\\') ||
    relativePath.includes('\0')
  ) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  // Only the image and PDF types produced by the upload endpoint are served, so
  // a stray file can never be rendered as same-origin HTML/SVG.
  const mimeType = SERVED_TYPES[path.posix.extname(relativePath).toLowerCase()];
  if (!mimeType) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (isWorkers) {
    await serveWorkerObject(`temp_images/${relativePath}`, mimeType, res);
    return;
  }
  const baseDir = getTempImagesDir();
  const fullPath = resolvePathWithin(baseDir, relativePath);
  if (!fullPath) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  // Uploads are always retained locally. Prefer that same-origin copy so browser
  // PDF generation does not depend on cross-origin bucket CORS configuration.
  if (!fs.existsSync(fullPath)) {
    if (storageConfig.isR2Enabled) {
      res.redirect(302, await getR2SignedUrl(`temp_images/${relativePath}`));
      return;
    }
    if (storageConfig.isS3Enabled) {
      res.redirect(302, await getS3SignedUrl(`temp_images/${relativePath}`));
      return;
    }
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const buf = fs.readFileSync(fullPath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  } catch (e) {
    console.error('Error serving nested temp image:', e);
    res.status(500).json({ error: 'Error serving file' });
  }
}
