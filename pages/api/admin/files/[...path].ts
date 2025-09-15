import type { NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';

function isSafe(rel: string): boolean {
  return rel.startsWith('generated/') || rel.startsWith('temp_images/');
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
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
  if (!isSafe(rel)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const full = path.join(process.cwd(), 'public', rel);
  const normalized = path.normalize(full);
  const base = path.join(process.cwd(), 'public');
  if (!normalized.startsWith(base)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    res.status(400).json({ error: 'Path is a directory' });
    return;
  }
  const buf = fs.readFileSync(full);
  const mimeType = lookup(path.basename(full)) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.send(buf);
}

export default withAdminAccess(handler);

