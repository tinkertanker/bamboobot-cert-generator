// Server-side tier detection and management
import { prisma } from './prisma';
import { getTierLimits, type UserTier } from '@/types/user';
import { isValidEmail, normaliseEmail } from '@/utils/email-utils';

// Get admin configuration from environment variables
// These are optional - if not set, admin features are disabled

/**
 * Validates and normalizes a domain name
 * Requires at least one dot and a valid TLD structure
 */
function isValidDomain(domain: string): boolean {
  // Simple domain validation that requires at least one dot and TLD
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253 && !domain.includes('..') && !domain.startsWith('.') && !domain.endsWith('.');
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
    .map(email => normaliseEmail(email))
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
type DbUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

export async function updateUserTierIfNeeded(userId: string): Promise<DbUser> {
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
  const now = new Date();
  const utcDayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  await prisma.user.updateMany({
    where: { id: userId, lastUsageReset: { lt: utcDayStart } },
    data: {
      dailyPdfCount: 0,
      dailyEmailCount: 0,
      lastUsageReset: now,
    },
  });
}

export interface EmailQuotaReservation {
  allowed: boolean;
  limit: number | null;
  current: number;
  tier?: UserTier;
}

export async function checkEmailUsageAvailability(
  userId: string,
  recipientCount: number,
): Promise<EmailQuotaReservation> {
  if (!Number.isSafeInteger(recipientCount) || recipientCount <= 0) {
    throw new Error('Recipient count must be a positive integer');
  }
  await resetDailyUsageIfNeeded(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, dailyEmailCount: true },
  });
  if (!user) return { allowed: false, limit: 0, current: 0 };
  const tier = user.tier as UserTier;
  const limit = getTierLimits(tier).dailyEmailLimit;
  return {
    allowed: limit === null || user.dailyEmailCount + recipientCount <= limit,
    limit,
    current: user.dailyEmailCount,
    tier,
  };
}

/** Atomically reserve quota for the number of actual recipients being sent. */
export async function reserveEmailUsage(
  userId: string,
  recipientCount: number,
): Promise<EmailQuotaReservation> {
  if (!Number.isSafeInteger(recipientCount) || recipientCount <= 0) {
    throw new Error('Recipient count must be a positive integer');
  }
  await resetDailyUsageIfNeeded(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, dailyEmailCount: true },
  });
  if (!user) return { allowed: false, limit: 0, current: 0 };

  const tier = user.tier as UserTier;
  const limit = getTierLimits(tier).dailyEmailLimit;
  if (limit !== null && recipientCount > limit) {
    return { allowed: false, limit, current: user.dailyEmailCount, tier };
  }

  const reservation = await prisma.user.updateMany({
    where: {
      id: userId,
      ...(limit === null
        ? {}
        : { dailyEmailCount: { lte: limit - recipientCount } }),
    },
    data: {
      dailyEmailCount: { increment: recipientCount },
      lifetimeEmailCount: { increment: recipientCount },
    },
  });
  if (reservation.count === 0) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyEmailCount: true },
    });
    return {
      allowed: false,
      limit,
      current: current?.dailyEmailCount ?? user.dailyEmailCount,
      tier,
    };
  }
  return {
    allowed: true,
    limit,
    current: user.dailyEmailCount + recipientCount,
    tier,
  };
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
): Promise<DbUser> {
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
