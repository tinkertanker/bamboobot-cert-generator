const mockUpdate = jest.fn();
jest.mock('@/lib/server/prisma', () => ({ prisma: { user: { update: (...args: unknown[]) => mockUpdate(...args) } } }));

// tiers.ts reads the admin env vars on every call, so one import serves every case.
import { detectUserTier, syncUserTier } from '@/lib/server/tiers';

const originalEnv = process.env;

describe('Multi-domain Admin Configuration', () => {
  beforeEach(() => {
    // Keep essential env vars but remove admin ones
    const cleanEnv = { ...originalEnv };
    delete cleanEnv.SUPER_ADMIN_EMAILS;
    delete cleanEnv.SUPER_ADMIN_EMAIL;
    delete cleanEnv.ADMIN_DOMAINS;
    delete cleanEnv.ADMIN_DOMAIN;
    process.env = cleanEnv;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('detectUserTier', () => {
    describe('with no admin configuration', () => {
      it('should return free tier for regular email', () => {
        expect(detectUserTier('user@example.com')).toBe('free');
      });

      it('should return existing tier when provided', () => {
        expect(detectUserTier('user@example.com', 'plus')).toBe('plus');
      });

      it('should return free tier for null email', () => {
        expect(detectUserTier(null)).toBe('free');
      });

      it('should keep a non-admin existing tier for null email', () => {
        expect(detectUserTier(null, 'plus')).toBe('plus');
      });
    });

    describe('with multi-value SUPER_ADMIN_EMAILS', () => {
      it('should detect super admin from any position in the list', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        expect(detectUserTier('admin@company.com')).toBe('super_admin');
        expect(detectUserTier('founder@startup.io')).toBe('super_admin');
        expect(detectUserTier('ceo@corporation.org')).toBe('super_admin');
      });

      it('should be case insensitive', () => {
        process.env.SUPER_ADMIN_EMAILS = ' Admin@Company.Com , FOUNDER@STARTUP.IO , ceo@corporation.org ';
        expect(detectUserTier('ADMIN@COMPANY.COM')).toBe('super_admin');
        expect(detectUserTier('Admin@Company.Com')).toBe('super_admin');
        expect(detectUserTier(' founder@Startup.io ')).toBe('super_admin');
      });

      it('should return free for non-matching email', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        expect(detectUserTier('user@example.com')).toBe('free');
      });
    });

    describe('with multi-value ADMIN_DOMAINS', () => {
      it('should detect admin from any position in the list', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        expect(detectUserTier('user@company.com')).toBe('admin');
        expect(detectUserTier('employee@startup.io')).toBe('admin');
        expect(detectUserTier('staff@corporation.org')).toBe('admin');
      });

      it('should be case insensitive', () => {
        process.env.ADMIN_DOMAINS = ' Company.Com , STARTUP.IO , corporation.org ';
        expect(detectUserTier('user@COMPANY.COM')).toBe('admin');
        expect(detectUserTier('user@Company.Com')).toBe('admin');
        expect(detectUserTier(' employee@Startup.io ')).toBe('admin');
      });

      it('should return free for non-matching domain', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        expect(detectUserTier('user@example.com')).toBe('free');
      });
    });

    describe('with legacy single values', () => {
      it('falls back to legacy values, case insensitively', () => {
        process.env.SUPER_ADMIN_EMAIL = ' Legacy@Admin.Com ';
        process.env.ADMIN_DOMAIN = ' Legacy.Com ';
        expect(detectUserTier('LEGACY@ADMIN.COM')).toBe('super_admin');
        expect(detectUserTier('USER@LEGACY.COM')).toBe('admin');
      });
    });

    describe('priority order', () => {
      it('prefers super admin over a listed domain, and still grants admin to the rest of it', () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@company.com';
        process.env.ADMIN_DOMAINS = 'company.com';
        expect(detectUserTier('super@company.com')).toBe('super_admin');
        expect(detectUserTier('regular@company.com')).toBe('admin');
      });
    });

    describe('mixed new and legacy configuration', () => {
      it('should prioritize new multi-value over legacy for super admin', () => {
        process.env.SUPER_ADMIN_EMAILS = 'new@admin.com';
        process.env.SUPER_ADMIN_EMAIL = 'old@admin.com';
        process.env.ADMIN_DOMAINS = 'newdomain.com';
        process.env.ADMIN_DOMAIN = 'olddomain.com';
        expect(detectUserTier('new@admin.com')).toBe('super_admin');
        expect(detectUserTier('old@admin.com')).toBe('free');
      });

      it('should prioritize new multi-value over legacy for admin domain', () => {
        process.env.SUPER_ADMIN_EMAILS = 'new@admin.com';
        process.env.SUPER_ADMIN_EMAIL = 'old@admin.com';
        process.env.ADMIN_DOMAINS = 'newdomain.com';
        process.env.ADMIN_DOMAIN = 'olddomain.com';
        expect(detectUserTier('user@newdomain.com')).toBe('admin');
        expect(detectUserTier('user@olddomain.com')).toBe('free');
      });
    });

    describe('input validation and security', () => {
      it('should handle invalid email formats gracefully', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        process.env.ADMIN_DOMAINS = 'valid.com';
        expect(detectUserTier('invalid-email')).toBe('free');
        expect(detectUserTier('invalid@')).toBe('free');
        expect(detectUserTier('@invalid.com')).toBe('free');
        expect(detectUserTier('invalid@invalid')).toBe('free');
        expect(detectUserTier('')).toBe('free');
      });

      it('should handle malformed inputs', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        expect(detectUserTier('   ')).toBe('free');
        expect(detectUserTier('\n\t')).toBe('free');
      });

      it('should handle non-string inputs safely', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        // TypeScript should prevent this, but test runtime safety
        expect(detectUserTier(undefined as any)).toBe('free');
        expect(detectUserTier(123 as any)).toBe('free');
        expect(detectUserTier({} as any)).toBe('free');
      });

    });

    describe('with malformed environment variables', () => {
      it('should handle empty strings in comma-separated lists', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com,,another@admin.com,';
        process.env.ADMIN_DOMAINS = 'valid.com,,another.com,';
        
        expect(detectUserTier('valid@admin.com')).toBe('super_admin');
        expect(detectUserTier('another@admin.com')).toBe('super_admin');
        expect(detectUserTier('user@valid.com')).toBe('admin');
        expect(detectUserTier('user@another.com')).toBe('admin');
      });

      it('ignores invalid entries, so an all-invalid list falls back to the legacy value', () => {
        // A list that kept invalid entries would count as configured and skip the fallback.
        process.env.SUPER_ADMIN_EMAILS = 'invalid-email,also invalid';
        process.env.SUPER_ADMIN_EMAIL = 'legacy@admin.com';
        process.env.ADMIN_DOMAINS = 'invalid_domain,no-tld';
        process.env.ADMIN_DOMAIN = 'legacy.com';
        expect(detectUserTier('legacy@admin.com')).toBe('super_admin');
        expect(detectUserTier('user@legacy.com')).toBe('admin');
      });
    });

    describe('revoking admin tiers removed from the env', () => {
      it('demotes an env-granted admin whose domain is no longer listed', () => {
        process.env.ADMIN_DOMAINS = 'other.com';
        expect(detectUserTier('staff@company.com', 'admin')).toBe('free');
        expect(detectUserTier('staff@company.com', 'admin', 'env')).toBe('free');
      });

      it('demotes an env-granted super admin whose email is no longer listed', () => {
        expect(detectUserTier('former@company.com', 'super_admin')).toBe('free');
        expect(detectUserTier(null, 'super_admin')).toBe('free');
      });

      it('moves a super admin removed from SUPER_ADMIN_EMAILS down to admin if their domain is listed', () => {
        process.env.ADMIN_DOMAINS = 'company.com';
        expect(detectUserTier('former@company.com', 'super_admin')).toBe('admin');
      });

      it('keeps plus for env-sourced users', () => {
        expect(detectUserTier('user@example.com', 'plus', 'env')).toBe('plus');
      });

      it('keeps manually granted admin tiers that the env does not list', () => {
        expect(detectUserTier('helper@example.com', 'admin', 'manual')).toBe('admin');
        expect(detectUserTier('boss@example.com', 'super_admin', 'manual')).toBe('super_admin');
      });

      it('lets the env raise a manual tier but never lower it', () => {
        process.env.SUPER_ADMIN_EMAILS = 'boss@company.com';
        process.env.ADMIN_DOMAINS = 'company.com';
        expect(detectUserTier('boss@company.com', 'admin', 'manual')).toBe('super_admin');
        expect(detectUserTier('staff@company.com', 'plus', 'manual')).toBe('admin');
        expect(detectUserTier('manual@company.com', 'super_admin', 'manual')).toBe('super_admin');
      });
    });
  });
});

describe('syncUserTier', () => {
  const update = mockUpdate;

  beforeEach(() => {
    update.mockReset();
    const cleanEnv = { ...originalEnv };
    delete cleanEnv.SUPER_ADMIN_EMAILS;
    delete cleanEnv.SUPER_ADMIN_EMAIL;
    delete cleanEnv.ADMIN_DOMAIN;
    cleanEnv.ADMIN_DOMAINS = 'company.com';
    process.env = cleanEnv;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('persists the demotion of a removed env admin', async () => {
    await expect(
      syncUserTier({ id: 'u1', email: 'old@removed.com', tier: 'admin', tierSource: 'env' })
    ).resolves.toBe('free');
    expect(update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { tier: 'free', tierSource: 'env' } });
  });

  it('does not write when the tier is unchanged', async () => {
    await expect(
      syncUserTier({ id: 'u2', email: 'staff@company.com', tier: 'admin', tierSource: 'env' })
    ).resolves.toBe('admin');
    await expect(
      syncUserTier({ id: 'u3', email: 'helper@example.com', tier: 'admin', tierSource: 'manual' })
    ).resolves.toBe('admin');
    expect(update).not.toHaveBeenCalled();
  });

  it('treats a missing source as env', async () => {
    await expect(
      syncUserTier({ id: 'u4', email: 'old@removed.com', tier: 'super_admin', tierSource: null })
    ).resolves.toBe('free');
  });
});
