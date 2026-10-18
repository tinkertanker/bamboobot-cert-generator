import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The app uses no ISR or data cache, so the default in-memory incremental
// cache is enough and no extra R2 bucket or KV namespace is needed.
export default defineCloudflareConfig({});
