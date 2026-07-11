import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('rate-limit utility', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.RATE_LIMIT_WINDOW_SECONDS = '1';
    process.env.RATE_LIMIT_API_PER_MIN = '3';
    delete process.env.TRUST_PROXY_HEADERS;
    delete process.env.VERCEL;
    delete process.env.RATE_LIMIT_MAX_BUCKETS;
  });

  it('limits after N calls within window', async () => {
    const { rateLimit, buildKey } = await import('@/lib/rate-limit');
    const key = buildKey({
      userId: 'u1',
      ip: '127.0.0.1',
      route: 'test',
      category: 'api'
    });
    const r1 = rateLimit(key, 'api');
    const r2 = rateLimit(key, 'api');
    const r3 = rateLimit(key, 'api');
    const r4 = rateLimit(key, 'api');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
  });

  it('does not let authenticated callers rotate spoofed IP headers', async () => {
    const { buildKey } = await import('@/lib/rate-limit');
    expect(buildKey({ userId: 'u1', ip: '1.1.1.1', route: 'test', category: 'api' })).toBe(
      buildKey({ userId: 'u1', ip: '9.9.9.9', route: 'test', category: 'api' })
    );
  });

  it('ignores proxy headers unless explicitly trusted', async () => {
    const { getClientIp } = await import('@/lib/rate-limit');
    const request = {
      headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    expect(getClientIp(request)).toBe('127.0.0.1');
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(getClientIp(request)).toBe('1.1.1.1');
  });

  it('trusts platform-overwritten proxy headers on Vercel', async () => {
    process.env.VERCEL = '1';
    const { getClientIp } = await import('@/lib/rate-limit');
    expect(
      getClientIp({
        headers: { 'x-real-ip': '1.1.1.1' },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).toBe('1.1.1.1');
  });

  it('uses the trusted proxy-appended address rather than a spoofed X-Forwarded-For prefix', async () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    const { getClientIp } = await import('@/lib/rate-limit');
    expect(
      getClientIp({
        headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.24' },
        socket: { remoteAddress: '127.0.0.1' }
      })
    ).toBe('198.51.100.24');
  });

  it('isolates bounded authenticated and anonymous pools without global lockout', async () => {
    process.env.RATE_LIMIT_MAX_BUCKETS = '2';
    const { rateLimit, buildKey } = await import('@/lib/rate-limit');
    const key = (ip: string) => buildKey({ ip, route: 'test', category: 'api' });
    rateLimit(key('1.1.1.1'), 'api');
    rateLimit(key('2.2.2.2'), 'api');
    expect(rateLimit(key('3.3.3.3'), 'api').allowed).toBe(true);

    const authenticated = (userId: string) => buildKey({ userId, route: 'test', category: 'api' });
    rateLimit(authenticated('user-1'), 'api');
    rateLimit(authenticated('user-2'), 'api');
    expect(rateLimit(authenticated('user-3'), 'api').allowed).toBe(true);
    expect(rateLimit(authenticated('user-1'), 'api').remaining).toBe(2);
  });
});
