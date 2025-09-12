// Server-side tier detection and management
import { prisma } from './prisma';
import type { User } from '@prisma/client';
import type { UserTier } from '@/types/user';

// Get admin configuration from environment variables
// These are optional - if not set, admin features are disabled

/**
 * Validates and normalizes an email address
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates and normalizes a domain name
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain);
}

/**
 * Parse and validate comma-separated email list from environment variable
 */
function parseEmailList(envValue: string | undefined): string[] {
  if (!envValue || typeof envValue !== 'string') {
    return [];
  }
  
  return envValue
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0 && isValidEmail(email));
}

/**
 * Parse and validate comma-separated domain list from environment variable
 */
function parseDomainList(envValue: string | undefined): string[] {
  if (!envValue || typeof envValue !== 'string') {
    return [];
  }
  
  return envValue
    .split(',')
    .map(domain => domain.trim().toLowerCase())
    .filter(domain => domain.length > 0 && isValidDomain(domain));
}

/**
 * Get super admin emails from environment (supports both new and legacy formats)
 */
function getSuperAdminEmails(): string[] {
  const multiEmails = parseEmailList(process.env.SUPER_ADMIN_EMAILS);
  if (multiEmails.length > 0) {
    return multiEmails;
  }
  
  // Fallback to legacy single email
  return parseEmailList(process.env.SUPER_ADMIN_EMAIL);
}

/**
 * Get admin domains from environment (supports both new and legacy formats)
 */
function getAdminDomains(): string[] {
  const multiDomains = parseDomainList(process.env.ADMIN_DOMAINS);
  if (multiDomains.length > 0) {
    return multiDomains;
  }
  
  // Fallback to legacy single domain
  return parseDomainList(process.env.ADMIN_DOMAIN);
}

/**
 * Safely extract domain from email address
 */
function extractEmailDomain(email: string): string | null {
  if (!isValidEmail(email)) {
    return null;
  }
  
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/**
 * Determine user tier based on email and existing tier
 */
export function detectUserTier(email: string | null, currentTier?: UserTier): UserTier {
  if (!email || typeof email !== 'string') {
    return currentTier || 'free';
  }
  
  const normalizedEmail = email.trim().toLowerCase();
  
  // Validate email format before processing
  if (!isValidEmail(normalizedEmail)) {
    return currentTier || 'free';
  }
  
  // Check if super admin (highest priority)
  const superAdminEmails = getSuperAdminEmails();
  if (superAdminEmails.includes(normalizedEmail)) {
    return 'super_admin';
  }
  
  // Check if admin domain
  const domain = extractEmailDomain(normalizedEmail);
  const adminDomains = getAdminDomains();
  if (domain && adminDomains.includes(domain)) {
    return 'admin';
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