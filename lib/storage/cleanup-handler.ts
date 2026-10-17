import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

export const CLEANUP_KEY_HEADER = 'x-cleanup-key';

export function secretMatches(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== 'string') return false;
  // Compare fixed-length digests so neither content nor length leaks via timing.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function isDryRun(value: string | string[] | undefined): boolean {
  return value === '1' || value === 'true';
}

/**
 * Build the POST endpoint that deletes expired files from a cloud provider.
 * Called by scripts/storage-cleanup.sh on a schedule. Requires the
 * X-Cleanup-Key header to match CLEANUP_SECRET_KEY (mandatory in production).
 * `?dryRun=1` lists what would be deleted without deleting it.
 */
export function createCleanupHandler(options: {
  providerName: string;
  isConfigured: () => boolean;
  cleanup: (options: { dryRun?: boolean }) => Promise<{ deleted: string[]; errors: string[] }>;
}) {
  const { providerName } = options;

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!options.isConfigured()) {
      res.status(400).json({ error: `${providerName} storage is not configured` });
      return;
    }

    const authKey = req.headers[CLEANUP_KEY_HEADER];
    if (process.env.CLEANUP_SECRET_KEY && !secretMatches(authKey, process.env.CLEANUP_SECRET_KEY)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Without a secret key, block in production and warn in development.
    if (!process.env.CLEANUP_SECRET_KEY) {
      if (process.env.NODE_ENV === 'production') {
        res.status(401).json({ error: 'Authentication not configured' });
        return;
      }
      console.warn(`⚠️ WARNING: Authentication for the ${providerName} cleanup endpoint is not configured and the endpoint is unprotected in development`);
    }

    const dryRun = isDryRun(req.query?.dryRun);

    try {
      console.log(`Starting ${providerName} cleanup process...${dryRun ? ' (dry run)' : ''}`);
      const result = await options.cleanup({ dryRun });

      console.log(dryRun
        ? `Dry run complete. ${result.deleted.length} files would be deleted.`
        : `Cleanup complete. Deleted ${result.deleted.length} files.`);
      if (result.errors.length > 0) {
        console.error(`Errors processing ${result.errors.length} files.`);
      }

      res.status(200).json({
        success: true,
        ...(dryRun ? { dryRun: true } : {}),
        deletedCount: result.deleted.length,
        deleted: result.deleted,
        errorCount: result.errors.length,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
      res.status(500).json({
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
