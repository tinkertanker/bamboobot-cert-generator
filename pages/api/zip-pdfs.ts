import { NextApiRequest, NextApiResponse } from 'next';
import archiver from 'archiver';
import { parse } from 'url';
import path from 'path';
import fs from 'fs';
import { isR2Configured } from '@/lib/r2-client';
import { debug, error } from '@/lib/log';
import { requireAuth } from '@/lib/auth/requireAuth';
import { rateLimit, buildKey } from '@/lib/rate-limit';

interface FileInfo {
  url: string;
  filename: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Validate body first to return proper 400s before rate limits
  const { files }: { files: FileInfo[] } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'No files provided' });
    return;
  }

  // Auth + rate limit (after validation)
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const key = buildKey({ userId, ip, route: 'zip-pdfs', category: 'zip' });
  const rl = rateLimit(key, 'zip');
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Too many ZIP downloads. Please wait and try again.' });
    return;
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
      error('Archive error:', err);
      throw err;
    });

    // Log when archive is finalized
    archive.on('end', () => {
      debug('Archive wrote %d bytes', archive.pointer());
    });

    // Pipe the archive to the response
    archive.pipe(res);

    // Add each PDF to the archive
    for (const file of files) {
      try {
        debug(`Processing file: ${file.url} -> ${file.filename}`);
        
        // Check if this is an R2 URL (either direct endpoint or custom domain)
        if (isR2Configured() && (file.url.includes('.r2.cloudflarestorage.com') || (process.env.R2_PUBLIC_URL && file.url.startsWith(process.env.R2_PUBLIC_URL)))) {
          // Fetch the file from R2
          debug('Fetching from R2:', file.url);
          const response = await fetch(file.url);
          if (!response.ok) {
            error(`Failed to fetch from R2: ${response.status}`);
            continue;
          }
          const buffer = await response.arrayBuffer();
          
          // Add the buffer to archive
          archive.append(Buffer.from(buffer), { name: file.filename });
        } else {
          // Handle local files
          const parsedUrl = parse(file.url);
          const urlPath = parsedUrl.pathname || '';
          debug(`URL path: ${urlPath}`);
          
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
          debug(`File path: ${filePath}`);
          
          // Security check - ensure the file is within the generated directory
          const normalizedPath = path.normalize(filePath);
          const generatedDir = path.join(process.cwd(), 'public', 'generated');
          if (!normalizedPath.startsWith(generatedDir)) {
            error(`Security error: Invalid file path ${filePath}`);
            continue;
          }

          // Check if file exists
          if (!fs.existsSync(filePath)) {
            error(`File not found: ${filePath}`);
            continue;
          }

          // Add the file to the archive
          archive.file(filePath, { name: file.filename });
        }
        
      } catch (fileError) {
        error(`Error processing file ${file.filename}:`, fileError);
        // Continue with other files
      }
    }

    // Finalize the archive
    await archive.finalize();

  } catch (error) {
    error('ZIP creation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP file' });
    }
    return;
  }
}
