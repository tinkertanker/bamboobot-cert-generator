type Bucket = {
  count: number;
  resetAt: number; // epoch ms when window resets
};

// Simple in-memory sliding window limiter per key.
// Good enough for single-instance Node; swap to Redis for multi-instance.
class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  check(key: string, limit: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
    }
    if (bucket.count < limit) {
      bucket.count += 1;
      return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
    }
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
}

// Singleton limiter with configurable window
const windowSeconds = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '60', 10);
const limiter = new RateLimiter(windowSeconds * 1000);

export type LimitCategory =
  | 'api'
  | 'upload'
  | 'generate'
  | 'zip'
  | 'email';

const DEFAULTS: Record<LimitCategory, number> = {
  api: parseInt(process.env.RATE_LIMIT_API_PER_MIN || '120', 10),
  upload: parseInt(process.env.RATE_LIMIT_UPLOAD_PER_MIN || '6', 10),
  generate: parseInt(process.env.RATE_LIMIT_GENERATE_PER_MIN || '10', 10),
  zip: parseInt(process.env.RATE_LIMIT_ZIP_PER_MIN || '5', 10),
  email: parseInt(process.env.RATE_LIMIT_EMAIL_PER_MIN || '60', 10),
};

export function rateLimit(key: string, category: LimitCategory) {
  const limit = DEFAULTS[category] ?? DEFAULTS.api;
  const result = limiter.check(key, limit);
  return { ...result, limit };
}

// Helper to build a reasonably unique key per user/IP + route
export function buildKey(opts: { userId?: string | null; ip?: string | null; route: string; category: LimitCategory }) {
  const user = opts.userId ? `u:${opts.userId}` : 'u:anon';
  const ip = opts.ip ? `ip:${opts.ip}` : 'ip:unknown';
  return `${opts.category}:${opts.route}:${user}:${ip}`;
}

// Extract IP from request headers
// x-forwarded-for can be "client, proxy1, proxy2" - take the first (original client)
// Headers can be string | string[] in Next.js, handle both cases
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string | null {
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const realIp = Array.isArray(xRealIp)
    ? xRealIp[0]?.trim() || null
    : typeof xRealIp === 'string'
      ? xRealIp.trim()
      : null;
  // Extract first IP from comma-separated list
  const forwardedFor = Array.isArray(xForwardedFor)
    ? xForwardedFor[0]?.split(',')[0]?.trim() || null
    : typeof xForwardedFor === 'string'
      ? xForwardedFor.split(',')[0]?.trim() || null
      : null;
  return realIp || forwardedFor || req.socket?.remoteAddress || null;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  limit: number;
  remaining: number;
}

/**
 * Enforce rate limiting on an API route
 * Sets appropriate headers and returns whether request is allowed
 */
export function enforceRateLimit(
  req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  res: { setHeader: (name: string, value: string) => void },
  opts: { userId?: string | null; route: string; category: LimitCategory }
): RateLimitResult {
  const ip = getClientIp(req);
  const key = buildKey({ userId: opts.userId, ip, route: opts.route, category: opts.category });
  const rl = rateLimit(key, opts.category);

  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));

  const retryAfter = Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(retryAfter));
  }

  return {
    allowed: rl.allowed,
    retryAfter,
    limit: rl.limit,
    remaining: rl.remaining
  };
}

