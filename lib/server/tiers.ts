// Server-side tier detection and management
import { prisma } from './prisma';
import type { User } from '@prisma/client';
import type { UserTier } from '@/types/user';

// Get admin configuration from environment variables
// These are optional - if not set, admin features are disabled
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const ADMIN_DOMAIN = process.env.ADMIN_DOMAIN;

/**
 * Determine user tier based on email and existing tier
 */
export function detectUserTier(email: string | null, currentTier?: UserTier): UserTier {
  if (!email) return currentTier || 'free';
  
  // Check if super admin (only if configured)
  if (SUPER_ADMIN_EMAIL && email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return 'super_admin';
  }
  
  // Check if admin domain (only if configured)
  if (ADMIN_DOMAIN) {
    const domain = email.split('@')[1];
    if (domain && domain.toLowerCase() === ADMIN_DOMAIN.toLowerCase()) {
      return 'admin';
    }
  }
  
  // Return existing tier or default to free
  return currentTier || 'free';
}

/**
 * Update user tier if needed based on email
 */
export async function updateUserTierIfNeeded(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const detectedTier = detectUserTier(user.email, user.tier as UserTier);
  
  // Update tier if it changed
  if (detectedTier !== user.tier) {
    return await prisma.user.update({
      where: { id: userId },
      data: { tier: detectedTier }
    });
  }
  
  return user;
}

/**
 * Check if usage counters need to be reset (daily reset)
 */
export async function resetDailyUsageIfNeeded(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastUsageReset: true }
  });
  
  if (!user) return;
  
  const now = new Date();
  const lastReset = new Date(user.lastUsageReset);
  
  // Check if it's a new day (UTC)
  const isNewDay = now.getUTCDate() !== lastReset.getUTCDate() ||
                   now.getUTCMonth() !== lastReset.getUTCMonth() ||
                   now.getUTCFullYear() !== lastReset.getUTCFullYear();
  
  if (isNewDay) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        dailyPdfCount: 0,
        dailyEmailCount: 0,
        lastUsageReset: now
      }
    });
  }
}

/**
 * Increment usage counter for a specific action
 */
export async function incrementUsage(
  userId: string, 
  action: 'pdf' | 'email'
): Promise<void> {
  // First reset if needed
  await resetDailyUsageIfNeeded(userId);
  
  const field = action === 'pdf' ? 'dailyPdfCount' : 'dailyEmailCount';
  const lifetimeField = action === 'pdf' ? 'lifetimePdfCount' : 'lifetimeEmailCount';
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      [field]: { increment: 1 },
      [lifetimeField]: { increment: 1 }
    }
  });
}

/**
 * Log a usage action
 */
export async function logUsage(
  userId: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.usageLog.create({
    data: {
      userId,
      action,
      metadata: metadata as any || {}
    }
  });
}

/**
 * Log an audit action (for admin actions)
 */
export async function logAudit(
  actorId: string,
  action: string,
  targetId?: string,
  targetType?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetId,
      targetType,
      metadata: metadata as any || {}
    }
  });
}

/**
 * Get user's project count
 */
export async function getUserProjectCount(userId: string): Promise<number> {
  return await prisma.project.count({
    where: { ownerId: userId }
  });
}

/**
 * Manually set user tier (admin action)
 */
export async function setUserTier(
  actorId: string,
  targetUserId: string,
  newTier: UserTier
): Promise<User> {
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { tier: newTier }
  });
  
  // Log the audit action
  await logAudit(
    actorId,
    newTier === 'plus' ? 'user_upgrade' : 'user_downgrade',
    targetUserId,
    'user',
    { newTier, previousTier: updatedUser.tier }
  );
  
  return updatedUser;
}