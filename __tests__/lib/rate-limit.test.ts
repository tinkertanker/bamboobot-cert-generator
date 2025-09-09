import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('rate-limit utility', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.RATE_LIMIT_WINDOW_SECONDS = '1';
    process.env.RATE_LIMIT_API_PER_MIN = '3';
  });

  it('limits after N calls within window', async () => {
    const { rateLimit, buildKey } = await import('@/lib/rate-limit');
    const key = buildKey({ userId: 'u1', ip: '127.0.0.1', route: 'test', category: 'api' });
    const r1 = rateLimit(key, 'api');
    const r2 = rateLimit(key, 'api');
    const r3 = rateLimit(key, 'api');
    const r4 = rateLimit(key, 'api');
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
  });
});

