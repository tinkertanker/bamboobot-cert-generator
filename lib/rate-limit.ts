type Bucket = {
  count: number;
  resetAt: number; // epoch ms when window resets
};

import { getEnv, type AppBindings } from '@/lib/cloudflare/env';
import type { RateLimit } from '@/lib/cloudflare/types';

// In-memory fixed-window limiter per key. On Cloudflare each isolate has its
// own copy, so it is only the fallback for `next dev` and tests; deployed
// Workers use the Rate Limiting bindings declared in wrangler.jsonc.
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

const RATE_LIMIT_BINDINGS: Record<LimitCategory, keyof AppBindings> = {
  api: 'RATE_LIMIT_API',
  upload: 'RATE_LIMIT_UPLOAD',
  generate: 'RATE_LIMIT_GENERATE',
  download: 'RATE_LIMIT_DOWNLOAD',
  zip: 'RATE_LIMIT_ZIP',
  email: 'RATE_LIMIT_EMAIL'
};

function rateLimitBinding(category: LimitCategory): RateLimit | null {
  try {
    const binding = getEnv()[RATE_LIMIT_BINDINGS[category]] as RateLimit | undefined;
    return binding && typeof binding.limit === 'function' ? binding : null;
  } catch {
    return null;
  }
}

/**
 * Check and count one request against `key`. Uses the category's Workers Rate
 * Limiting binding when present (limits are set in wrangler.jsonc) and the
 * in-memory limiter otherwise.
 */
export async function rateLimit(key: string, category: LimitCategory) {
  const limit = DEFAULTS[category] ?? DEFAULTS.api;
  const binding = rateLimitBinding(category);
  if (binding) {
    const { success } = await binding.limit({ key });
    // The binding reports only allow/deny; its windows are 60 seconds.
    return { allowed: success, remaining: success ? 1 : 0, resetAt: Date.now() + 60_000, limit };
  }
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

// Extract the client IP. Behind Cloudflare, CF-Connecting-IP is set by the
// edge and overwrites anything the client sends. Elsewhere (`next dev`) the
// socket address is used unless TRUST_PROXY_HEADERS allows proxy headers;
// then an overwritten X-Real-IP is preferred, else the right-most
// X-Forwarded-For value (the peer the single trusted proxy observed).
// Headers can be string | string[] in Next.js, handle both cases
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | null {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  const cfIp = Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
  if (cfIp && cfIp.trim()) return cfIp.trim();

  const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true';
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
export async function enforceRateLimit(
  req: {
    headers: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
  },
  res: { setHeader: (name: string, value: string) => void },
  opts: { userId?: string | null; route: string; category: LimitCategory }
): Promise<RateLimitResult> {
  const ip = getClientIp(req);
  const key = buildKey({
    userId: opts.userId,
    ip,
    route: opts.route,
    category: opts.category
  });
  const rl = await rateLimit(key, opts.category);

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
