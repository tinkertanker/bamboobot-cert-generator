import { cleanupExpiredFiles, isR2Configured } from '@/lib/r2-client';
import { createCleanupHandler } from '@/lib/storage/cleanup-handler';

export default createCleanupHandler({
  providerName: 'R2',
  isConfigured: () => isR2Configured(),
  cleanup: (options) => cleanupExpiredFiles(options),
});
