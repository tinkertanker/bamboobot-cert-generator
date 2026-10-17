import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import prisma from '@/lib/server/prisma';

// Throttle DB updates for lastActiveAt to once per 5 minutes per user
const lastTouch = new Map<string, number>();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

async function touchUser(userId: string) {
  const now = Date.now();
  const last = lastTouch.get(userId) || 0;
  if (now - last < TOUCH_INTERVAL_MS) return;
  lastTouch.set(userId, now);
  // Fire and forget; don't block response on analytics write
  prisma.user
    .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
    .catch(() => void 0);
}

/**
 * Callers scope storage paths and database queries by this id, so it must be
 * a non-empty string. An undefined id would silently drop Prisma `where`
 * filters (matching every owner) and collapse storage prefixes to `u_undefined`.
 */
function toUserId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function unauthorized(res: NextApiResponse): null {
  res.status(401).json({ message: 'Unauthorized' });
  return null;
}

export async function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  // Fast path: JWT token check without importing authOptions
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    const uid = toUserId((token as { uid?: unknown }).uid) ?? toUserId(token.sub);
    if (!uid) return unauthorized(res);
    touchUser(uid);
    return {
      user: {
        id: uid,
        email: typeof token.email === 'string' ? token.email : null,
        name: typeof token.name === 'string' ? token.name : null,
      },
    } as any;
  }

  // Fallback: server session (may be undefined in tests without NextAuth wiring)
  const session = await getServerSession(req, res, undefined as any);
  const uid = toUserId((session as any)?.user?.id);
  if (!uid) return unauthorized(res);
  touchUser(uid);
  return session as any;
}
