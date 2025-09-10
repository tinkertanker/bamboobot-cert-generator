// API endpoint for updating user tiers (admin only)
import { NextApiResponse } from 'next';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { setUserTier } from '@/lib/server/tiers';
import type { UserTier } from '@/types/user';
import type { AuthenticatedRequest } from '@/types/api';

async function updateTierHandler(
  req: AuthenticatedRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const actor = req.user;
  const { userId, tier } = req.body;
  
  if (!userId || !tier) {
    res.status(400).json({ error: 'Missing userId or tier' });
    return;
  }
  
  // Validate tier value
  const validTiers: UserTier[] = ['free', 'plus', 'admin', 'super_admin'];
  if (!validTiers.includes(tier)) {
    res.status(400).json({ error: 'Invalid tier value' });
    return;
  }
  
  // Only super admins can set super_admin tier
  if (tier === 'super_admin' && actor.tier !== 'super_admin') {
    res.status(403).json({ error: 'Only super admins can grant super admin access' });
    return;
  }
  
  // Prevent self-demotion for super admins
  if (userId === actor.id && actor.tier === 'super_admin' && tier !== 'super_admin') {
    res.status(403).json({ error: 'Super admins cannot demote themselves' });
    return;
  }
  
  try {
    const updatedUser = await setUserTier(actor.id, userId, tier);
    
    res.status(200).json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        tier: updatedUser.tier
      }
    });
  } catch (error) {
    // Log error internally in production
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating user tier:', error);
    }
    res.status(500).json({ error: 'Failed to update user tier' });
  }
}

export default withAdminAccess(updateTierHandler);