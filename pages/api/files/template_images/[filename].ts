import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth/requireAuth';
import { getPublicDir } from '@/lib/paths';

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
  const filePath = path.join(getPublicDir(), 'template_images', filename);

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
    }

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileBuffer.length.toString());
    res.setHeader('Cache-Control', 'private, no-store');
    
    // Send file
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving template file:', error);
    res.status(500).json({ error: 'Error serving file' });
    return;
  }
}
