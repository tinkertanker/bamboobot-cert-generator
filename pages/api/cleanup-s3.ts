import { cleanupExpiredS3Files, isS3Configured } from '@/lib/s3-client';
import { createCleanupHandler } from '@/lib/storage/cleanup-handler';

export default createCleanupHandler({
  providerName: 'S3',
  isConfigured: () => isS3Configured(),
  cleanup: (options) => cleanupExpiredS3Files(options),
});
