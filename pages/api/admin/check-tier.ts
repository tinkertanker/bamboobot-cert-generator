// Temporary endpoint to check and update user tier
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier, updateUserTierIfNeeded } from '@/lib/server/tiers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Force update tier based on email
  const updatedUser = await updateUserTierIfNeeded(session.user.id);
  
  // Get detected tier
  const detectedTier = detectUserTier(session.user.email || null);
  
  res.status(200).json({
    email: session.user.email,
    currentTier: updatedUser.tier,
    detectedTier,
    shouldBeAdmin: detectedTier === 'admin' || detectedTier === 'super_admin',
    envVars: {
      SUPER_ADMIN_EMAILS: process.env.SUPER_ADMIN_EMAILS ? 'Set' : 'Not set',
      SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL ? 'Set (legacy)' : 'Not set',
      ADMIN_DOMAINS: process.env.ADMIN_DOMAINS ? 'Set' : 'Not set',
      ADMIN_DOMAIN: process.env.ADMIN_DOMAIN ? 'Set (legacy)' : 'Not set'
    }
  });
}