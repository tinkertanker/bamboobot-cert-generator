import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { deleteObjects } from '@/lib/storage-manager';

type DeleteRequestBody = {
  items: Array<{ key: string; isPrefix?: boolean }>;
};

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { items } = req.body as DeleteRequestBody;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'No items provided' });
    return;
  }

  try {
    const result = await deleteObjects(items);
    res.status(200).json({ success: true, ...result });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('storage/delete failed:', e);
    }
    res.status(500).json({ error: 'Failed to delete items' });
  }
}

export default withAdminAccess(handler);

