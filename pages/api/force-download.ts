import { NextApiRequest, NextApiResponse } from 'next';
import { isR2Configured } from '@/lib/r2-client';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { url, filename } = req.query;
  
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const downloadFilename = (filename && typeof filename === 'string') ? filename : 'download.pdf';

  try {
    // Set download headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);

    if (isR2Configured() && (url.includes('.r2.cloudflarestorage.com') || (process.env.R2_PUBLIC_URL && url.startsWith(process.env.R2_PUBLIC_URL)))) {
      // Fetch from R2 (either direct endpoint or custom domain) and stream to response
      console.log('Downloading from R2:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Failed to fetch from R2: ${response.status}`);
        return res.status(404).json({ error: 'File not found' });
      }

      // Stream the response
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } else {
      // Handle local files
      const parsedUrl = new URL(url, `http://localhost:3000`);
      let filePath: string;

      if (parsedUrl.pathname.startsWith('/api/files/generated/')) {
        const relativePath = parsedUrl.pathname.replace(/^\/api\/files\/generated\//, '');
        filePath = path.join(process.cwd(), 'public', 'generated', relativePath);
      } else if (parsedUrl.pathname.startsWith('/generated/')) {
        const relativePath = parsedUrl.pathname.replace(/^\/generated\//, '');
        filePath = path.join(process.cwd(), 'public', 'generated', relativePath);
      } else {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      // Security check
      const normalizedPath = path.normalize(filePath);
      const generatedDir = path.join(process.cwd(), 'public', 'generated');
      if (!normalizedPath.startsWith(generatedDir)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      // Check if file exists and stream it
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      const fileBuffer = fs.readFileSync(filePath);
      res.send(fileBuffer);
    }
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
}