type Bucket = {
  count: number;
  resetAt: number; // epoch ms when window resets
};

// Simple in-memory sliding window limiter per key.
// Good enough for single-instance Node; swap to Redis for multi-instance.
class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly maxBuckets: number;
  private readonly evictLiveOnCapacity: boolean;

  constructor(windowMs: number, maxBuckets: number, evictLiveOnCapacity = false) {
    this.windowMs = windowMs;
    this.maxBuckets = maxBuckets;
    this.evictLiveOnCapacity = evictLiveOnCapacity;
  }

  private makeRoom(now: number): number | null {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
    if (this.buckets.size < this.maxBuckets) return null;
    if (this.evictLiveOnCapacity) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      return null;
    }
    let earliestResetAt = Number.POSITIVE_INFINITY;
    for (const bucket of this.buckets.values()) {
      earliestResetAt = Math.min(earliestResetAt, bucket.resetAt);
    }
    return earliestResetAt;
  }

  check(key: string, limit: number) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (!bucket) {
        const capacityResetAt = this.makeRoom(now);
        if (capacityResetAt !== null) {
          return { allowed: false, remaining: 0, resetAt: capacityResetAt };
        }
      }
      const resetAt = now + this.windowMs;
      this.buckets.delete(key);
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
    }
    if (bucket.count < limit) {
      bucket.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt
      };
    }
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
}

// Singleton limiter with configurable window
const windowSeconds = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '60', 10);
const configuredMaxBuckets = parseInt(process.env.RATE_LIMIT_MAX_BUCKETS || '10000', 10);
const maxBuckets =
  Number.isSafeInteger(configuredMaxBuckets) && configuredMaxBuckets > 0
    ? Math.min(configuredMaxBuckets, 100000)
    : 10000;
// Authenticated keys exclude client IP and use server-defined routes, so one
// identity cannot create unbounded keys to evict its own enforcement record.
const authenticatedLimiter = new RateLimiter(windowSeconds * 1000, maxBuckets, true);
// Anonymous capability downloads favor availability at saturation. This pool
// is isolated, so live eviction cannot weaken authenticated-user enforcement.
const anonymousLimiter = new RateLimiter(windowSeconds * 1000, maxBuckets, true);

export type LimitCategory = 'api' | 'upload' | 'generate' | 'download' | 'zip' | 'email';

const DEFAULTS: Record<LimitCategory, number> = {
  api: parseInt(process.env.RATE_LIMIT_API_PER_MIN || '120', 10),
  upload: parseInt(process.env.RATE_LIMIT_UPLOAD_PER_MIN || '6', 10),
  generate: parseInt(process.env.RATE_LIMIT_GENERATE_PER_MIN || '10', 10),
  download: parseInt(process.env.RATE_LIMIT_DOWNLOAD_PER_MIN || '30', 10),
  zip: parseInt(process.env.RATE_LIMIT_ZIP_PER_MIN || '5', 10),
  email: parseInt(process.env.RATE_LIMIT_EMAIL_PER_MIN || '60', 10)
};

export function rateLimit(key: string, category: LimitCategory) {
  const limit = DEFAULTS[category] ?? DEFAULTS.api;
  const limiter = key.includes(':u:anon:') ? anonymousLimiter : authenticatedLimiter;
  const result = limiter.check(key, limit);
  return { ...result, limit };
}

// Helper to build a reasonably unique key per user/IP + route
export function buildKey(opts: { userId?: string | null; ip?: string | null; route: string; category: LimitCategory }) {
  if (opts.userId) {
    return `${opts.category}:${opts.route}:u:${opts.userId}`;
  }
  const ip = opts.ip ? `ip:${opts.ip}` : 'ip:unknown';
  return `${opts.category}:${opts.route}:u:anon:${ip}`;
}

// Extract IP from request headers
// When exactly one trusted reverse proxy appends X-Forwarded-For, the
// right-most value is the peer address it observed and cannot be supplied by
// the client. Prefer an overwritten X-Real-IP when available.
// Headers can be string | string[] in Next.js, handle both cases
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | null {
  const trustProxyHeaders =
    process.env.TRUST_PROXY_HEADERS === 'true' ||
    (process.env.TRUST_PROXY_HEADERS === undefined && process.env.VERCEL === '1');
  if (!trustProxyHeaders) {
    return req.socket?.remoteAddress || null;
  }
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  const realIp = Array.isArray(xRealIp)
    ? xRealIp[0]?.trim() || null
    : typeof xRealIp === 'string'
      ? xRealIp.trim()
      : null;
  const forwardedValues = (Array.isArray(xForwardedFor) ? xForwardedFor.join(',') : xForwardedFor || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const forwardedFor = forwardedValues.at(-1) || null;
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
  req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  },
  res: { setHeader: (name: string, value: string) => void },
  opts: { userId?: string | null; route: string; category: LimitCategory }
): RateLimitResult {
  const ip = getClientIp(req);
  const key = buildKey({
    userId: opts.userId,
    ip,
    route: opts.route,
    category: opts.category
  });
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
