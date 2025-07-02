import { NextApiRequest, NextApiResponse } from 'next';
import archiver from 'archiver';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';

interface FileInfo {
  url: string;
  filename: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files }: { files: FileInfo[] } = req.body;
    
    console.log('ZIP API called with files:', files);
    
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="certificates.zip"');

    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create archive' });
    });

    // Pipe the archive to the response
    archive.pipe(res);

    // Add each PDF to the archive
    for (const file of files) {
      try {
        console.log(`Processing file: ${file.url} -> ${file.filename}`);
        
        // Extract the file path from the URL
        const parsedUrl = parse(file.url);
        const urlPath = parsedUrl.pathname || '';
        console.log(`URL path: ${urlPath}`);
        
        // Convert URL path to file system path
        // Remove /api/files/generated/ prefix and get the actual path
        const relativePath = urlPath.replace(/^\/api\/files\/generated\//, '');
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

        console.log(`Adding file to archive: ${file.filename}`);
        // Add the file to the archive with custom filename
        const fileStream = fs.createReadStream(filePath);
        archive.append(fileStream, { name: file.filename });
        
      } catch (fileError) {
        console.error(`Error processing file ${file.url}:`, fileError);
        // Continue with other files even if one fails
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

// Disable Next.js body parsing since we're handling streams
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};