import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { filename } = req.query;

  if (!filename || typeof filename !== 'string') {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filePath = path.join(process.cwd(), 'public', 'template_images', filename);

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
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year since templates are permanent
    
    // Send file
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving template file:', error);
    res.status(500).json({ error: 'Error serving file' });
    return;
  }
}
