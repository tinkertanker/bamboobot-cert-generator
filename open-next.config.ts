import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// The app has no ISR pages. User files are not an incremental-cache bucket.
export default defineCloudflareConfig();
