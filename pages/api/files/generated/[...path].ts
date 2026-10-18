import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getObject } from '@/lib/storage/bucket';
import { sendStoredObject } from '@/lib/storage/serve';

const SERVED_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { path: filePath } = req.query;

  if (!filePath || !Array.isArray(filePath)) {
    res.status(400).json({ error: 'Invalid file path' });
    return;
  }

  if (filePath[0] !== `u_${userId}`) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const relativePath = filePath.join('/');
  if (
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.includes('\\') ||
    relativePath.includes('\0')
  ) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  // Generated storage only ever holds PDFs (plus ZIP archives); never serve
  // anything a browser could render as same-origin active content.
  const mimeType = SERVED_TYPES[path.posix.extname(relativePath).toLowerCase()];
  if (!mimeType) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const object = await getObject(`generated/${relativePath}`);
    if (!object) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    await sendStoredObject(res, object, { contentType: mimeType });
  } catch (error) {
    console.error('Error serving file:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error serving file' });
  }
}
