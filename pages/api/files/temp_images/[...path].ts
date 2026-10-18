import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getObject } from '@/lib/storage/bucket';
import { sendStoredObject } from '@/lib/storage/serve';

const SERVED_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

// Serve nested temp_images paths, e.g. temp_images/u_<userId>/<filename>.
// Served same-origin so browser PDF generation needs no bucket CORS setup.
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

  try {
    const object = await getObject(`temp_images/${relativePath}`);
    if (!object) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    await sendStoredObject(res, object, { contentType: mimeType });
  } catch (e) {
    console.error('Error serving nested temp image:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Error serving file' });
  }
}
