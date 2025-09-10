// Client-side hook for user tier management and usage tracking
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { getTierLimits, getRemainingQuota, type UserTier, type TierLimits } from '@/types/user';

interface UseUserTierReturn {
  tier: UserTier;
  limits: TierLimits;
  usage: {
    dailyPdfCount: number;
    dailyEmailCount: number;
    pdfRemaining: number | null;
    emailRemaining: number | null;
  };
  canGenerate: boolean;
  canEmail: boolean;
  canCreateProject: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  checkLimit: (feature: 'pdf' | 'email' | 'project') => Promise<{
    allowed: boolean;
    remaining?: number;
    limit?: number;
  }>;
  refreshUsage: () => Promise<void>;
}

export function useUserTier(): UseUserTierReturn {
  const { data: session, update } = useSession();
  const [projectCount, setProjectCount] = useState<number>(0);
  
  // Extract tier and usage from session
  const user = session?.user;
  const tier = (user?.tier || 'free') as UserTier;
  const dailyPdfCount = user?.dailyPdfCount || 0;
  const dailyEmailCount = user?.dailyEmailCount || 0;
  
  // Get tier limits
  const limits = getTierLimits(tier);
  
  // Calculate remaining quotas
  const pdfRemaining = limits.dailyPdfLimit === null 
    ? null 
    : Math.max(0, limits.dailyPdfLimit - dailyPdfCount);
    
  const emailRemaining = limits.dailyEmailLimit === null
    ? null
    : Math.max(0, limits.dailyEmailLimit - dailyEmailCount);
  
  // Check if user can perform actions
  const canGenerate = limits.dailyPdfLimit === null || dailyPdfCount < limits.dailyPdfLimit;
  const canEmail = limits.dailyEmailLimit === null || dailyEmailCount < limits.dailyEmailLimit;
  const canCreateProject = limits.projectLimit === null || projectCount < limits.projectLimit;
  
  // Admin checks
  const isAdmin = tier === 'admin' || tier === 'super_admin';
  const isSuperAdmin = tier === 'super_admin';
  
  // Fetch project count on mount and when session changes
  useEffect(() => {
    async function fetchProjectCount() {
      if (!session?.user) return;
      
      try {
        const response = await fetch('/api/user/project-count');
        if (response.ok) {
          const data = await response.json();
          setProjectCount(data.count);
        }
      } catch (error) {
        // Silently fail - project count check is non-critical for UI
      }
    }
    
    fetchProjectCount();
  }, [session]);
  
  // Check limit for a specific feature
  const checkLimit = useCallback(async (feature: 'pdf' | 'email' | 'project') => {
    if (!session?.user) {
      return { allowed: false };
    }
    
    try {
      const response = await fetch(`/api/limits/check?feature=${feature}`);
      if (response.ok) {
        const data = await response.json();
        return {
          allowed: data.allowed,
          remaining: data.remaining,
          limit: data.limit
        };
      }
    } catch (error) {
      // Return safe default on error
    }
    
    return { allowed: false };
  }, [session]);
  
  // Refresh usage data
  const refreshUsage = useCallback(async () => {
    if (!session) return;
    
    // Trigger session update to get fresh usage data
    await update();
  }, [session, update]);
  
  return {
    tier,
    limits,
    usage: {
      dailyPdfCount,
      dailyEmailCount,
      pdfRemaining,
      emailRemaining
    },
    canGenerate,
    canEmail,
    canCreateProject,
    isAdmin,
    isSuperAdmin,
    checkLimit,
    refreshUsage
  };
}