import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { getProvider } from '@/lib/storage-manager';
import { getPublicUrl as getR2Url } from '@/lib/r2-client';
import { getS3SignedUrl } from '@/lib/s3-client';

function safeKey(key: string): boolean {
  return key.startsWith('generated/') || key.startsWith('temp_images/');
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = (req.query.key as string) || '';
  if (!key || !safeKey(key)) {
    res.status(400).json({ error: 'Invalid key' });
    return;
  }
  try {
    const provider = getProvider();
    if (provider === 'cloudflare-r2') {
      const url = await getR2Url(key);
      res.redirect(302, url);
      return;
    } else if (provider === 'amazon-s3') {
      const url = await getS3SignedUrl(key);
      res.redirect(302, url);
      return;
    }
    // local
    res.redirect(302, `/api/admin/files/${encodeURIComponent(key)}`);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error('admin/storage/get error:', e);
    res.status(500).json({ error: 'Failed to get file URL' });
  }
}

export default withAdminAccess(handler);

