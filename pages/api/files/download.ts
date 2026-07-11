import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getGeneratedDir, resolvePathWithin } from '@/lib/paths';
import { enforceRateLimit } from '@/lib/rate-limit';
import storageConfig from '@/lib/storage-config';
import { getPublicUrl as getR2SignedUrl } from '@/lib/r2-client';
import { getS3SignedUrl } from '@/lib/s3-client';
import {
  SignedFileUrlError,
  verifySignedGeneratedFileUrl,
} from '@/lib/security/signed-generated-url';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rl = enforceRateLimit(req, res, { route: 'files:download', category: 'download' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many download requests' });
    return;
  }

  const relativePath = Array.isArray(req.query.path) ? '' : req.query.path;
  const expires = Array.isArray(req.query.expires) ? '' : req.query.expires;
  const signature = Array.isArray(req.query.signature) ? '' : req.query.signature;

  if (!relativePath || !expires || !signature) {
    res.status(400).json({ error: 'Invalid download link' });
    return;
  }

  try {
    const verifiedPath = verifySignedGeneratedFileUrl(relativePath, expires, signature);
    const objectKey = `generated/${verifiedPath}`;
    if (storageConfig.isR2Enabled) {
      res.redirect(302, await getR2SignedUrl(objectKey));
      return;
    }
    if (storageConfig.isS3Enabled) {
      res.redirect(302, await getS3SignedUrl(objectKey));
      return;
    }

    const filePath = resolvePathWithin(getGeneratedDir(), verifiedPath);
    if (!filePath) {
      throw new SignedFileUrlError('Invalid generated file path', 403);
    }
    const realBaseDir = fs.realpathSync(getGeneratedDir());
    const realFilePath = fs.realpathSync(filePath);
    const relativeRealPath = path.relative(realBaseDir, realFilePath);
    if (
      !relativeRealPath ||
      relativeRealPath === '..' ||
      relativeRealPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRealPath)
    ) {
      throw new SignedFileUrlError('Generated file escapes private storage', 403);
    }

    const stat = fs.statSync(realFilePath);
    if (!stat.isFile()) {
      throw new SignedFileUrlError('Generated file is not a regular file', 400);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(verifiedPath).replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = fs.createReadStream(realFilePath);
    stream.on('error', streamError => {
      console.error('Error streaming signed generated file:', streamError);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(streamError);
    });
    stream.pipe(res);
  } catch (error) {
    if (error instanceof SignedFileUrlError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    console.error('Error serving signed generated file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
}
