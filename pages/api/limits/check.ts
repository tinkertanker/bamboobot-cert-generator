// API endpoint to check feature limits
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { checkFeatureAccess } from '@/lib/server/middleware/featureGate';

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
  
  const { feature } = req.query;
  
  if (!feature || !['pdf', 'email', 'project'].includes(feature as string)) {
    res.status(400).json({ error: 'Invalid feature parameter' });
    return;
  }
  
  try {
    const result = await checkFeatureAccess(
      session.user.id,
      feature as 'pdf' | 'email' | 'project'
    );
    
    res.status(200).json(result);
  } catch (error) {
    // Log error internally in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Error checking feature access:', error);
    }
    res.status(500).json({ error: 'Failed to check feature access' });
  }
}