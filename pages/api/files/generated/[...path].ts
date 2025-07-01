import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path: filePath } = req.query;
  
  if (!filePath || !Array.isArray(filePath)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Join the path segments
  const relativePath = filePath.join('/');
  const fullPath = path.join(process.cwd(), 'public', 'generated', relativePath);
  
  // Security check - ensure the file is within the generated directory
  const normalizedPath = path.normalize(fullPath);
  const generatedDir = path.join(process.cwd(), 'public', 'generated');
  if (!normalizedPath.startsWith(generatedDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const fileBuffer = fs.readFileSync(fullPath);
    const filename = path.basename(relativePath);
    const mimeType = lookup(filename) || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
}