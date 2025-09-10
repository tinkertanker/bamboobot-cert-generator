// API endpoint to get user's project count
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { getUserProjectCount } from '@/lib/server/tiers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const session = await getServerSession(req, res, authOptions);
  
  if (!session?.user?.id) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  
  try {
    const count = await getUserProjectCount(session.user.id);
    res.status(200).json({ count });
  } catch (error) {
    // Log error internally in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching project count:', error);
    }
    res.status(500).json({ error: 'Failed to fetch project count' });
  }
}