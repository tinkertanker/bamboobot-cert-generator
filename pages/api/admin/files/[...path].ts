import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { getLocalStorageDir, resolvePathWithin } from '@/lib/paths';

function isSafe(rel: string): boolean {
  return rel.startsWith('generated/') || rel.startsWith('temp_images/');
}

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
  const rel = segments.join('/');
  if (path.posix.normalize(rel) !== rel || rel.includes('\\') || !isSafe(rel)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const base = getLocalStorageDir();
  const full = resolvePathWithin(base, rel);
  if (!full) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  try {
    const realBase = fs.realpathSync(base);
    const realFile = fs.realpathSync(full);
    const realRelative = path.relative(realBase, realFile);
    if (
      !realRelative ||
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const stat = fs.statSync(realFile);
    if (!stat.isFile()) {
      res.status(400).json({ error: 'Path is not a file' });
      return;
    }
    const mimeType = lookup(path.basename(realFile)) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = fs.createReadStream(realFile);
    stream.on('error', error => {
      console.error('Error streaming admin file:', error);
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    console.error('Error serving admin file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
}

export default withAdminAccess(adminFilesHandler);
