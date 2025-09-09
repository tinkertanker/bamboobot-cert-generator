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

export async function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  // Fast path: JWT token check without importing authOptions
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) {
    const uid = (token as any).uid ?? token.sub;
    if (uid) touchUser(String(uid));
    return { user: { id: uid } } as any;
  }

  // Fallback: server session (may be undefined in tests without NextAuth wiring)
  const session = await getServerSession(req, res, undefined as any);
  const hasUser = session && (session as any).user;
  if (!hasUser) {
    res.status(401).json({ message: 'Unauthorized' });
    return null;
  }
  const uid = (session as any).user?.id as string | undefined;
  if (uid) touchUser(uid);
  return session as any;
}
