import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getObject } from '@/lib/storage/bucket';
import { inlineDisposition, sendStoredObject } from '@/lib/storage/serve';
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

  const rl = await enforceRateLimit(req, res, { route: 'files:download', category: 'download' });
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
    const object = await getObject(`generated/${verifiedPath}`);
    if (!object) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    await sendStoredObject(res, object, {
      contentType: 'application/pdf',
      disposition: inlineDisposition(path.posix.basename(verifiedPath)),
    });
  } catch (error) {
    if (error instanceof SignedFileUrlError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error serving signed generated file:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error serving file' });
  }
}
