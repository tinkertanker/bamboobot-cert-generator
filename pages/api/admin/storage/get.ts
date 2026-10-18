import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { ensureSafeStorageKey } from '@/lib/storage-manager';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = (req.query.key as string) || '';
  if (!key || !ensureSafeStorageKey(key)) {
    res.status(400).json({ error: 'Invalid key' });
    return;
  }
  // Objects are private; the admin files route streams them after its own check.
  res.redirect(302, `/api/admin/files/${key.split('/').map(encodeURIComponent).join('/')}`);
}

export default withAdminAccess(handler);
