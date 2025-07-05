import { NextApiRequest, NextApiResponse } from 'next';
import archiver from 'archiver';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';
import { isR2Configured } from '@/lib/r2-client';

interface FileInfo {
  url: string;
  filename: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { files }: { files: FileInfo[] } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  try {
    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="certificates.zip"');

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    // Log when archive is finalized
    archive.on('end', () => {
      console.log('Archive wrote %d bytes', archive.pointer());
    });

    // Pipe the archive to the response
    archive.pipe(res);

    // Add each PDF to the archive
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.url} -> ${file.filename}`);
        
        // Check if this is an R2 URL (either direct endpoint or custom domain)
        if (isR2Configured() && (file.url.includes('.r2.cloudflarestorage.com') || (process.env.R2_PUBLIC_URL && file.url.startsWith(process.env.R2_PUBLIC_URL)))) {
          // Fetch the file from R2
          console.log('Fetching from R2:', file.url);
          const response = await fetch(file.url);
          if (!response.ok) {
            console.error(`Failed to fetch from R2: ${response.status}`);
            continue;
          }
          const buffer = await response.arrayBuffer();
          
          // Add the buffer to archive
          archive.append(Buffer.from(buffer), { name: file.filename });
        } else {
          // Handle local files
          const parsedUrl = parse(file.url);
          const urlPath = parsedUrl.pathname || '';
          console.log(`URL path: ${urlPath}`);
          
          // Convert URL path to file system path
          // Handle both direct URLs (/generated/) and API URLs (/api/files/generated/)
          let relativePath: string;
          if (urlPath.startsWith('/api/files/generated/')) {
            relativePath = urlPath.replace(/^\/api\/files\/generated\//, '');
          } else if (urlPath.startsWith('/generated/')) {
            relativePath = urlPath.replace(/^\/generated\//, '');
          } else {
            console.error(`Unexpected URL format: ${urlPath}`);
            continue;
          }
          
          const filePath = path.join(process.cwd(), 'public', 'generated', relativePath);
          console.log(`File path: ${filePath}`);
          
          // Security check - ensure the file is within the generated directory
          const normalizedPath = path.normalize(filePath);
          const generatedDir = path.join(process.cwd(), 'public', 'generated');
          if (!normalizedPath.startsWith(generatedDir)) {
            console.error(`Security error: Invalid file path ${filePath}`);
            continue;
          }

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
          }

          // Add the file to the archive
          archive.file(filePath, { name: file.filename });
        }
        
      } catch (fileError) {
        console.error(`Error processing file ${file.filename}:`, fileError);
        // Continue with other files
      }
    }

    // Finalize the archive
    await archive.finalize();

  } catch (error) {
    console.error('ZIP creation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP file' });
    }
  }
}