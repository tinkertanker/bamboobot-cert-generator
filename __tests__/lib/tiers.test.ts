import { UserTier } from '@/types/user';

// Mock environment variables
const originalEnv = process.env;

// Helper to get a fresh instance of detectUserTier with new env vars
const getDetectUserTier = () => {
  jest.resetModules();
  const { detectUserTier } = require('@/lib/server/tiers');
  return detectUserTier;
};

describe('Multi-domain Admin Configuration', () => {
  beforeEach(() => {
    jest.resetModules();
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
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@example.com')).toBe('free');
      });

      it('should return existing tier when provided', () => {
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@example.com', 'plus')).toBe('plus');
      });

      it('should return free tier for null email', () => {
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier(null)).toBe('free');
      });

      it('should return existing tier for null email when provided', () => {
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier(null, 'admin')).toBe('admin');
      });
    });

    describe('with multi-value SUPER_ADMIN_EMAILS', () => {
      it('should detect super admin from first email', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('admin@company.com')).toBe('super_admin');
      });

      it('should detect super admin from middle email', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('founder@startup.io')).toBe('super_admin');
      });

      it('should detect super admin from last email', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('ceo@corporation.org')).toBe('super_admin');
      });

      it('should be case insensitive', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('ADMIN@COMPANY.COM')).toBe('super_admin');
        expect(detectUserTier('Admin@Company.Com')).toBe('super_admin');
      });

      it('should handle extra whitespace', () => {
        process.env.SUPER_ADMIN_EMAILS = ' admin@company.com , founder@startup.io , ceo@corporation.org ';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('admin@company.com')).toBe('super_admin');
      });

      it('should return free for non-matching email', () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@company.com,founder@startup.io,ceo@corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@example.com')).toBe('free');
      });
    });

    describe('with multi-value ADMIN_DOMAINS', () => {
      it('should detect admin from first domain', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@company.com')).toBe('admin');
      });

      it('should detect admin from middle domain', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('employee@startup.io')).toBe('admin');
      });

      it('should detect admin from last domain', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('staff@corporation.org')).toBe('admin');
      });

      it('should be case insensitive', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@COMPANY.COM')).toBe('admin');
        expect(detectUserTier('user@Company.Com')).toBe('admin');
      });

      it('should handle extra whitespace', () => {
        process.env.ADMIN_DOMAINS = ' company.com , startup.io , corporation.org ';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@company.com')).toBe('admin');
      });

      it('should return free for non-matching domain', () => {
        process.env.ADMIN_DOMAINS = 'company.com,startup.io,corporation.org';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@example.com')).toBe('free');
      });
    });

    describe('with legacy single values', () => {
      it('should detect super admin from legacy SUPER_ADMIN_EMAIL', () => {
        process.env.SUPER_ADMIN_EMAIL = 'legacy@admin.com';
        process.env.ADMIN_DOMAIN = 'legacy.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('legacy@admin.com')).toBe('super_admin');
      });

      it('should detect admin from legacy ADMIN_DOMAIN', () => {
        process.env.SUPER_ADMIN_EMAIL = 'legacy@admin.com';
        process.env.ADMIN_DOMAIN = 'legacy.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@legacy.com')).toBe('admin');
      });

      it('should be case insensitive for legacy values', () => {
        process.env.SUPER_ADMIN_EMAIL = 'legacy@admin.com';
        process.env.ADMIN_DOMAIN = 'legacy.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('LEGACY@ADMIN.COM')).toBe('super_admin');
        expect(detectUserTier('USER@LEGACY.COM')).toBe('admin');
      });
    });

    describe('priority order', () => {
      it('should prioritize super admin over admin domain', () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@company.com';
        process.env.ADMIN_DOMAINS = 'company.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('super@company.com')).toBe('super_admin');
      });

      it('should still detect admin from domain if not super admin', () => {
        process.env.SUPER_ADMIN_EMAILS = 'super@company.com';
        process.env.ADMIN_DOMAINS = 'company.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('regular@company.com')).toBe('admin');
      });
    });

    describe('mixed new and legacy configuration', () => {
      it('should prioritize new multi-value over legacy for super admin', () => {
        process.env.SUPER_ADMIN_EMAILS = 'new@admin.com';
        process.env.SUPER_ADMIN_EMAIL = 'old@admin.com';
        process.env.ADMIN_DOMAINS = 'newdomain.com';
        process.env.ADMIN_DOMAIN = 'olddomain.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('new@admin.com')).toBe('super_admin');
        expect(detectUserTier('old@admin.com')).toBe('free');
      });

      it('should prioritize new multi-value over legacy for admin domain', () => {
        process.env.SUPER_ADMIN_EMAILS = 'new@admin.com';
        process.env.SUPER_ADMIN_EMAIL = 'old@admin.com';
        process.env.ADMIN_DOMAINS = 'newdomain.com';
        process.env.ADMIN_DOMAIN = 'olddomain.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('user@newdomain.com')).toBe('admin');
        expect(detectUserTier('user@olddomain.com')).toBe('free');
      });
    });

    describe('input validation and security', () => {
      it('should handle invalid email formats gracefully', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        process.env.ADMIN_DOMAINS = 'valid.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('invalid-email')).toBe('free');
        expect(detectUserTier('invalid@')).toBe('free');
        expect(detectUserTier('@invalid.com')).toBe('free');
        expect(detectUserTier('invalid@invalid')).toBe('free');
        expect(detectUserTier('')).toBe('free');
      });

      it('should handle malformed inputs', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('   ')).toBe('free');
        expect(detectUserTier('\n\t')).toBe('free');
      });

      it('should handle non-string inputs safely', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        const detectUserTier = getDetectUserTier();
        // TypeScript should prevent this, but test runtime safety
        expect(detectUserTier(undefined as any)).toBe('free');
        expect(detectUserTier(123 as any)).toBe('free');
        expect(detectUserTier({} as any)).toBe('free');
      });

      it('should sanitize email input', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com';
        const detectUserTier = getDetectUserTier();
        expect(detectUserTier('  VALID@ADMIN.COM  ')).toBe('super_admin');
      });
    });

    describe('with malformed environment variables', () => {
      it('should handle empty strings in comma-separated lists', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com,,another@admin.com,';
        process.env.ADMIN_DOMAINS = 'valid.com,,another.com,';
        const detectUserTier = getDetectUserTier();
        
        expect(detectUserTier('valid@admin.com')).toBe('super_admin');
        expect(detectUserTier('another@admin.com')).toBe('super_admin');
        expect(detectUserTier('user@valid.com')).toBe('admin');
        expect(detectUserTier('user@another.com')).toBe('admin');
      });

      it('should filter out invalid emails from environment', () => {
        process.env.SUPER_ADMIN_EMAILS = 'valid@admin.com,invalid-email,another@admin.com';
        const detectUserTier = getDetectUserTier();
        
        expect(detectUserTier('valid@admin.com')).toBe('super_admin');
        expect(detectUserTier('another@admin.com')).toBe('super_admin');
        expect(detectUserTier('invalid-email')).toBe('free');
      });

      it('should filter out invalid domains from environment', () => {
        process.env.ADMIN_DOMAINS = 'valid.com,invalid_domain,another.com';
        const detectUserTier = getDetectUserTier();
        
        expect(detectUserTier('user@valid.com')).toBe('admin');
        expect(detectUserTier('user@another.com')).toBe('admin');
        expect(detectUserTier('user@invalid_domain')).toBe('free');
      });

      it('should handle completely invalid environment values', () => {
        process.env.SUPER_ADMIN_EMAILS = 'invalid1,invalid2,invalid3';
        process.env.ADMIN_DOMAINS = 'invalid1,invalid2,invalid3';
        const detectUserTier = getDetectUserTier();
        
        expect(detectUserTier('user@example.com')).toBe('free');
      });
    });
  });
});