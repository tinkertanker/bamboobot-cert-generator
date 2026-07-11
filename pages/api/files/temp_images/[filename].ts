import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireAuth(req, res);
  if (!session) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Uploaded files are user-scoped and served only by the catch-all route.
  res.status(404).json({ error: 'File not found' });
}
