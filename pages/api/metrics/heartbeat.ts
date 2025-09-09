import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Accept GET/POST; POST is default from fetch
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET,POST');
    res.status(405).end();
    return;
  }
  const session = await requireAuth(req, res);
  if (!session) return;
  res.status(204).end();
}

