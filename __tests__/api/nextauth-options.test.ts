/** @jest-environment node */
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => jest.fn()) }));
jest.mock('next-auth/providers/google', () => ({ __esModule: true, default: jest.fn(() => ({ id: 'google' })) }));
jest.mock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: jest.fn(() => ({})) }));
jest.mock('@/lib/server/prisma', () => ({ __esModule: true, default: { user: {} } }));
jest.mock('@/lib/server/tiers', () => ({ detectUserTier: jest.fn(), resetDailyUsageIfNeeded: jest.fn() }));

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
