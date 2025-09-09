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
  email: parseInt(process.env.RATE_LIMIT_EMAIL_PER_MIN || '3', 10),
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

