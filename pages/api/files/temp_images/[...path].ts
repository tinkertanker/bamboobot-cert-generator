import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import { requireAuth } from '@/lib/auth/requireAuth';

// Serve nested temp_images paths, e.g. temp_images/u_<userId>/<filename>
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;

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
  const fullPath = path.join(process.cwd(), 'public', 'temp_images', relativePath);

  const normalizedPath = path.normalize(fullPath);
  const baseDir = path.join(process.cwd(), 'public', 'temp_images');
  if (!normalizedPath.startsWith(baseDir)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const buf = fs.readFileSync(fullPath);
    const filename = segments[segments.length - 1];
    const mimeType = lookup(filename) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buf);
  } catch (e) {
    console.error('Error serving nested temp image:', e);
    res.status(500).json({ error: 'Error serving file' });
  }
}

