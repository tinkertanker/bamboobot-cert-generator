// Feature gating middleware for API routes
import { NextApiRequest, NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier, UserWithTier } from '@/types/user';
import { incrementUsage, logUsage, resetDailyUsageIfNeeded, getUserProjectCount } from '@/lib/server/tiers';

export interface GateOptions {
  feature: 'pdf' | 'email' | 'project' | 'admin';
  increment?: boolean; // Whether to increment usage counter
  metadata?: Record<string, unknown>; // For logging
}

/**
 * Feature gate middleware - checks if user can perform action based on tier
 */
export function withFeatureGate(
  options: GateOptions,
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Get session
      const session = await getServerSession(req, res, authOptions);
      
      if (!session?.user?.id) {
        return res.status(401).json({ 
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }
      
      // Get fresh user data from database
      await resetDailyUsageIfNeeded(session.user.id);
      
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          tier: true,
          dailyPdfCount: true,
          dailyEmailCount: true,
          lastUsageReset: true,
          lifetimePdfCount: true,
          lifetimeEmailCount: true
        }
      });
      
      if (!user) {
        return res.status(401).json({ 
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      const userWithTier = user as UserWithTier;
      const limits = getTierLimits(userWithTier.tier);
      
      // Check admin access
      if (options.feature === 'admin') {
        if (!limits.canAccessAdmin) {
          return res.status(403).json({ 
            error: 'Admin access required',
            code: 'ADMIN_REQUIRED',
            tier: userWithTier.tier
          });
        }
        
        // Admin access granted, proceed
        // Attach user to request object
        Object.defineProperty(req, 'user', {
          value: userWithTier,
          writable: false,
          enumerable: true
        });
        return handler(req as AuthenticatedRequest, res);
      }
      
      // Check feature limits
      let canProceed = false;
      let limitReached = false;
      let currentUsage = 0;
      let limit: number | null = null;
      
      switch (options.feature) {
        case 'pdf':
          limit = limits.dailyPdfLimit;
          currentUsage = userWithTier.dailyPdfCount;
          canProceed = limit === null || currentUsage < limit;
          limitReached = !canProceed;
          break;
          
        case 'email':
          limit = limits.dailyEmailLimit;
          currentUsage = userWithTier.dailyEmailCount;
          canProceed = limit === null || currentUsage < limit;
          limitReached = !canProceed;
          break;
          
        case 'project':
          const projectCount = await getUserProjectCount(userWithTier.id);
          limit = limits.projectLimit;
          currentUsage = projectCount;
          canProceed = limit === null || projectCount < limit;
          limitReached = !canProceed;
          break;
      }
      
      if (!canProceed) {
        return res.status(403).json({ 
          error: `${options.feature} limit reached`,
          code: 'LIMIT_REACHED',
          feature: options.feature,
          tier: userWithTier.tier,
          limit,
          current: currentUsage,
          upgradeUrl: '/upgrade'
        });
      }
      
      // If we should increment usage, do it now
      if (options.increment && (options.feature === 'pdf' || options.feature === 'email')) {
        await incrementUsage(userWithTier.id, options.feature);
      }
      
      // Log the usage
      const actionMap = {
        pdf: 'pdf_generate',
        email: 'email_send',
        project: 'project_create',
        admin: 'admin_access'
      };
      
      await logUsage(
        userWithTier.id,
        actionMap[options.feature],
        options.metadata
      );
      
      // Attach user to request for handler to use
      Object.defineProperty(req, 'user', {
        value: userWithTier,
        writable: false,
        enumerable: true
      });
      
      // Call the actual handler with typed request
      return handler(req as AuthenticatedRequest, res);
      
    } catch (error) {
      // Log error internally but return generic message to client
      // In production, this would go to your logging service
      if (process.env.NODE_ENV === 'development') {
        console.error('Feature gate error:', error);
      }
      return res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Admin-only middleware
 */
export function withAdminAccess(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void>
) {
  return withFeatureGate({ feature: 'admin' }, handler);
}

/**
 * Check if user can perform action without blocking
 */
export async function checkFeatureAccess(
  userId: string,
  feature: 'pdf' | 'email' | 'project'
): Promise<{ allowed: boolean; limit?: number; current?: number; tier?: UserTier }> {
  try {
    await resetDailyUsageIfNeeded(userId);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        tier: true,
        dailyPdfCount: true,
        dailyEmailCount: true
      }
    });
    
    if (!user) {
      return { allowed: false };
    }
    
    const limits = getTierLimits(user.tier as UserTier);
    
    switch (feature) {
      case 'pdf':
        return {
          allowed: limits.dailyPdfLimit === null || user.dailyPdfCount < limits.dailyPdfLimit,
          limit: limits.dailyPdfLimit || undefined,
          current: user.dailyPdfCount,
          tier: user.tier as UserTier
        };
        
      case 'email':
        return {
          allowed: limits.dailyEmailLimit === null || user.dailyEmailCount < limits.dailyEmailLimit,
          limit: limits.dailyEmailLimit || undefined,
          current: user.dailyEmailCount,
          tier: user.tier as UserTier
        };
        
      case 'project':
        const projectCount = await getUserProjectCount(userId);
        return {
          allowed: limits.projectLimit === null || projectCount < limits.projectLimit,
          limit: limits.projectLimit || undefined,
          current: projectCount,
          tier: user.tier as UserTier
        };
        
      default:
        return { allowed: false };
    }
  } catch (error) {
    // Log error internally but return safe default
    if (process.env.NODE_ENV === 'development') {
      console.error('Check feature access error:', error);
    }
    return { allowed: false };
  }
}