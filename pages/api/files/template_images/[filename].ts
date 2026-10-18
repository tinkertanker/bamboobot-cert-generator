import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { requireAuth } from '@/lib/auth/requireAuth';
import { readStaticAsset } from '@/lib/cloudflare/assets';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireAuth(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { filename } = req.query;

  if (!filename || typeof filename !== 'string' || path.basename(filename) !== filename || filename.includes('\0')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  if (!/^dev-mode-template\.(?:pdf|jpe?g)$/i.test(filename)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const bytes = await readStaticAsset(`/template_images/${filename}`);
    if (!bytes) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', bytes.length.toString());
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(bytes));
  } catch (error) {
    console.error('Error serving template file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
}
