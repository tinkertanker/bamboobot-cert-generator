import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { ExecutionContext } from '@cloudflare/workers-types';

// Inlined by next.config.js at build time, never inferred from credentials.
export const isWorkers = process.env.BAMBOOBOT_RUNTIME === 'workers';

export function cloudflare() {
  return getCloudflareContext<Record<string, unknown>, ExecutionContext>();
}
