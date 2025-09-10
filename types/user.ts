// User tier and authentication types

export type UserTier = 'free' | 'plus' | 'admin' | 'super_admin';

export interface TierLimits {
  dailyPdfLimit: number | null;    // null = unlimited
  dailyEmailLimit: number | null;  // null = unlimited  
  projectLimit: number | null;     // null = unlimited
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canViewAllProjects: boolean;
  canDeleteAnyProject: boolean;
  canImpersonate: boolean;
}

export const TIER_LIMITS: Record<UserTier, TierLimits> = {
  free: {
    dailyPdfLimit: 10,
    dailyEmailLimit: 0,
    projectLimit: 1,
    canAccessAdmin: false,
    canManageUsers: false,
    canViewAllProjects: false,
    canDeleteAnyProject: false,
    canImpersonate: false,
  },
  plus: {
    dailyPdfLimit: null, // unlimited
    dailyEmailLimit: 100,
    projectLimit: 10,
    canAccessAdmin: false,
    canManageUsers: false,
    canViewAllProjects: false,
    canDeleteAnyProject: false,
    canImpersonate: false,
  },
  admin: {
    dailyPdfLimit: null,
    dailyEmailLimit: null,
    projectLimit: null,
    canAccessAdmin: true,
    canManageUsers: true,
    canViewAllProjects: true,
    canDeleteAnyProject: true,
    canImpersonate: false,
  },
  super_admin: {
    dailyPdfLimit: null,
    dailyEmailLimit: null,
    projectLimit: null,
    canAccessAdmin: true,
    canManageUsers: true,
    canViewAllProjects: true,
    canDeleteAnyProject: true,
    canImpersonate: true,
  },
};

export interface UserUsage {
  dailyPdfCount: number;
  dailyEmailCount: number;
  projectCount: number;
  lastReset: Date;
}

export interface UserWithTier {
  id: string;
  email: string | null;
  name: string | null;
  tier: UserTier;
  dailyPdfCount: number;
  dailyEmailCount: number;
  lastUsageReset: Date;
  lifetimePdfCount: number;
  lifetimeEmailCount: number;
}

export interface UsageAction {
  action: 'pdf_generate' | 'email_send' | 'project_create' | 'project_delete';
  metadata?: Record<string, unknown>;
}

export interface AuditAction {
  action: 'user_upgrade' | 'user_downgrade' | 'user_delete' | 'project_delete' | 'project_transfer' | 'impersonate_start' | 'impersonate_end';
  targetId?: string;
  targetType?: 'user' | 'project';
  metadata?: Record<string, unknown>;
}

// Helper functions
export function getTierLimits(tier: UserTier): TierLimits {
  return TIER_LIMITS[tier];
}

// Note: canPerformAction is not used - actual checks are done server-side in featureGate.ts
// This function is kept for reference but should not be used client-side

export function isAdmin(tier: UserTier): boolean {
  return tier === 'admin' || tier === 'super_admin';
}

export function isSuperAdmin(tier: UserTier): boolean {
  return tier === 'super_admin';
}

export function getRemainingQuota(user: UserWithTier, action: 'pdf' | 'email'): number | null {
  const limits = getTierLimits(user.tier);
  
  switch (action) {
    case 'pdf':
      if (limits.dailyPdfLimit === null) return null;
      return Math.max(0, limits.dailyPdfLimit - user.dailyPdfCount);
    case 'email':
      if (limits.dailyEmailLimit === null) return null;
      return Math.max(0, limits.dailyEmailLimit - user.dailyEmailCount);
    default:
      return 0;
  }
}