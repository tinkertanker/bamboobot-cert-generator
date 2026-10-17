/** @jest-environment node */
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => jest.fn()) }));
jest.mock('next-auth/providers/google', () => ({ __esModule: true, default: jest.fn(() => ({ id: 'google' })) }));
jest.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: jest.fn(() => ({})) }));
jest.mock('@/lib/server/prisma', () => ({ __esModule: true, default: { user: {} } }));
jest.mock('@/lib/server/tiers', () => ({ syncUserTier: jest.fn(), resetDailyUsageIfNeeded: jest.fn() }));

import { authOptions } from '@/pages/api/auth/[...nextauth]';

const signIn = authOptions.callbacks!.signIn! as (params: any) => Promise<boolean | string>;

describe('NextAuth signIn callback', () => {
  it('rejects Google accounts whose email is not verified', async () => {
    await expect(
      signIn({ user: { email: 'mallory@admin-domain.example' }, account: { provider: 'google' }, profile: { email_verified: false } })
    ).resolves.toBe(false);
    await expect(
      signIn({ user: { email: 'mallory@admin-domain.example' }, account: { provider: 'google' }, profile: {} })
    ).resolves.toBe(false);
  });

  it('accepts Google accounts with a verified email', async () => {
    await expect(
      signIn({ user: { email: 'alice@example.com' }, account: { provider: 'google' }, profile: { email_verified: true } })
    ).resolves.toBe(true);
  });

  it('does not enable dangerous email account linking', () => {
    const GoogleProvider = require('next-auth/providers/google').default;
    expect(GoogleProvider.mock.calls[0][0].allowDangerousEmailAccountLinking).toBeUndefined();
  });
});

describe('NextAuth jwt callback', () => {
  const prisma = require('@/lib/server/prisma').default;
  const { syncUserTier } = require('@/lib/server/tiers');
  const jwt = authOptions.callbacks!.jwt! as (params: any) => Promise<Record<string, unknown>>;

  beforeEach(() => {
    prisma.user.findUnique = jest.fn();
    prisma.user.update = jest.fn();
    syncUserTier.mockReset();
  });

  it('re-checks the tier on every session check, not only at sign-in', async () => {
    const dbUser = { id: 'u1', email: 'old@removed.com', tier: 'admin', tierSource: 'env', dailyPdfCount: 2, dailyEmailCount: 0 };
    prisma.user.findUnique.mockResolvedValue(dbUser);
    syncUserTier.mockResolvedValue('free');

    const token = await jwt({ token: { uid: 'u1', tier: 'admin' } });

    expect(syncUserTier).toHaveBeenCalledWith(dbUser);
    expect(token.tier).toBe('free');
    expect(token.dailyPdfCount).toBe(2);
  });

  it('resolves the tier on sign-in', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'staff@company.com', tier: 'free', tierSource: 'env', dailyPdfCount: 0, dailyEmailCount: 0 });
    syncUserTier.mockResolvedValue('admin');

    const token = await jwt({ token: {}, user: { id: 'u2', email: 'staff@company.com' }, trigger: 'signIn' });

    expect(token.uid).toBe('u2');
    expect(token.tier).toBe('admin');
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { lastActiveAt: expect.any(Date) } });
  });
});
