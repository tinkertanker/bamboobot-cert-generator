import { cleanupExpiredFiles } from '@/lib/storage/bucket';
import { createCleanupHandler } from '@/lib/storage/cleanup-handler';

// Called daily by the Worker's cron trigger (see worker.ts).
export default createCleanupHandler({
  providerName: 'R2',
  isConfigured: () => true,
  cleanup: (options) => cleanupExpiredFiles(options),
});
