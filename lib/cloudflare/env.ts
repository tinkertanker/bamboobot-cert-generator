import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { D1Database, DurableObjectNamespace, Fetcher, R2Bucket, RateLimit } from './types';

/**
 * Bindings declared in wrangler.jsonc. Keep this in step with that file.
 */
export interface AppBindings {
  /** D1 database holding users, projects, tiers and usage. */
  DB: D1Database;
  /** R2 bucket holding uploaded templates, generated PDFs and queued email attachments. */
  FILES: R2Bucket;
  /** Static assets (public/), used to read the certificate fonts on the server. */
  ASSETS?: Fetcher;
  /** One Durable Object per user that owns that user's bulk email queues. */
  EMAIL_QUEUE: DurableObjectNamespace;
  /** Workers Rate Limiting bindings, one per rate-limit category. */
  RATE_LIMIT_API?: RateLimit;
  RATE_LIMIT_UPLOAD?: RateLimit;
  RATE_LIMIT_GENERATE?: RateLimit;
  RATE_LIMIT_EMAIL?: RateLimit;
  RATE_LIMIT_DOWNLOAD?: RateLimit;
  RATE_LIMIT_ZIP?: RateLimit;
}

// Code that runs outside a Next.js request (the Durable Object, the cron
// handler, tests) has no OpenNext request context, so it registers the
// bindings it was given here.
let registeredEnv: AppBindings | null = null;

export function setWorkerEnv(env: AppBindings | null): void {
  registeredEnv = env;
}

export function getEnv(): AppBindings {
  try {
    return getCloudflareContext().env as unknown as AppBindings;
  } catch (error) {
    if (registeredEnv) return registeredEnv;
    throw error;
  }
}
