import type { NextApiResponse } from 'next';
import path from 'path';
import { lookup } from 'mime-types';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { ensureSafeStorageKey } from '@/lib/storage-manager';
import { getObject } from '@/lib/storage/bucket';
import { sendStoredObject } from '@/lib/storage/serve';

// Only types the app itself stores; anything else is sent as a download.
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'application/zip']);

export async function adminFilesHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const segments = req.query.path;
  if (!Array.isArray(segments) || segments.length === 0) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }
  const key = segments.join('/');
  if (!ensureSafeStorageKey(key)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  try {
    const object = await getObject(key);
    if (!object) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    const mimeType = lookup(path.posix.basename(key)) || 'application/octet-stream';
    const inline = INLINE_TYPES.has(mimeType);
    await sendStoredObject(res, object, {
      contentType: inline ? mimeType : 'application/octet-stream',
      disposition: inline ? undefined : 'attachment',
    });
  } catch (error) {
    console.error('Error serving admin file:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error serving file' });
  }
}

export default withAdminAccess(adminFilesHandler);
