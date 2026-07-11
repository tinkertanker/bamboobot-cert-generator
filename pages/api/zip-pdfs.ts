import { NextApiRequest, NextApiResponse } from 'next';
import archiver from 'archiver';
import { debug, error } from '@/lib/log';
import { requireAuth } from '@/lib/auth/requireAuth';
import { rateLimit, buildKey } from '@/lib/rate-limit';
import {
  getMaxPdfSourceBytes,
  loadTrustedPdf,
  PdfSourceError,
  sanitizePdfFilename,
} from '@/lib/security/trusted-pdf-source';

interface FileInfo {
  url: string;
  filename: string;
}

const MAX_ZIP_FILES = 500;
const MAX_ZIP_BYTES = 250 * 1024 * 1024;
const MAX_SOURCE_FAILURES = 5;
const DEFAULT_MAX_ZIP_DURATION_MS = 60_000;
const HARD_MAX_ZIP_DURATION_MS = 120_000;

function getMaxZipDurationMs(): number {
  const configured = Number.parseInt(process.env.MAX_ZIP_DURATION_MS || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_MAX_ZIP_DURATION_MS;
  }
  return Math.min(configured, HARD_MAX_ZIP_DURATION_MS);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Validate body first to return proper 400s before rate limits
  const { files }: { files: FileInfo[] } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: 'No files provided' });
    return;
  }

  if (files.length > MAX_ZIP_FILES) {
    res.status(413).json({ error: `A ZIP can contain at most ${MAX_ZIP_FILES} files` });
    return;
  }

  if (files.some((file) => !file || typeof file.url !== 'string' || typeof file.filename !== 'string')) {
    res.status(400).json({ error: 'Each file must include a URL and filename' });
    return;
  }

  // Auth + rate limit (after validation)
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const key = buildKey({ userId, ip, route: 'zip-pdfs', category: 'zip' });
  const rl = rateLimit(key, 'zip');
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Too many ZIP downloads. Please wait and try again.' });
    return;
  }

  let archiveTimeout: NodeJS.Timeout | undefined;

  try {
    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="certificates.zip"');
    res.setHeader('Cache-Control', 'private, no-store');

    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    let archiveFailure: Error | null = null;
    let resolveArchiveError!: (reason: Error) => void;
    const archiveError = new Promise<Error>((resolve) => {
      resolveArchiveError = resolve;
    });

    const failArchive = (reason: unknown) => {
      if (archiveFailure) return;
      archiveFailure = reason instanceof Error ? reason : new Error('ZIP archive failed');
      resolveArchiveError(archiveFailure);
    };

    // Resolve (rather than reject) immediately on archive errors so an event
    // emitted during an awaited source load cannot become an unhandled
    // rejection before finalization attaches its race handler.
    archive.on('error', (err) => {
      error('Archive error:', err);
      failArchive(err);
    });

    // Log when archive is finalized
    archive.on('end', () => {
      debug('Archive wrote %d bytes', archive.pointer());
    });

    // Pipe the archive to the response
    archive.pipe(res);

    let totalBytes = 0;
    let sourceFailures = 0;
    const maxZipDurationMs = getMaxZipDurationMs();
    const deadlineAt = Date.now() + maxZipDurationMs;

    archiveTimeout = setTimeout(() => {
      const timeoutError = new Error('ZIP generation timed out');
      failArchive(timeoutError);
      try {
        archive.abort();
      } catch {
        // The failure is already recorded and will be surfaced below.
      }
    }, maxZipDurationMs);

    // Add each validated PDF to the archive. Each source and the aggregate
    // archive input are bounded to avoid turning this endpoint into a memory
    // or bandwidth amplifier.
    for (const file of files) {
      if (archiveFailure) throw archiveFailure;

      const remainingDurationMs = deadlineAt - Date.now();
      if (remainingDurationMs <= 0) {
        const timeoutError = new Error('ZIP generation timed out');
        failArchive(timeoutError);
        throw timeoutError;
      }

      try {
        const remainingBytes = MAX_ZIP_BYTES - totalBytes;
        if (remainingBytes <= 0) {
          error('ZIP input limit reached; remaining files were skipped');
          break;
        }

        const { buffer } = await loadTrustedPdf(
          file.url,
          Math.min(getMaxPdfSourceBytes(), remainingBytes),
          { timeoutMs: remainingDurationMs }
        );
        if (archiveFailure) throw archiveFailure;

        totalBytes += buffer.length;
        archive.append(buffer, { name: sanitizePdfFilename(file.filename, 'certificate.pdf') });
      } catch (fileError) {
        if (archiveFailure) throw archiveFailure;

        if (fileError instanceof PdfSourceError) {
          error(`Skipped unsafe or unavailable PDF source (${fileError.code})`);
          sourceFailures += 1;

          // A too-large source can consume the entire per-file read budget
          // before being rejected. Stop rather than allowing a request to
          // repeat that expensive read hundreds of times.
          if (fileError.code === 'PDF_TOO_LARGE' || sourceFailures >= MAX_SOURCE_FAILURES) {
            break;
          }
        } else {
          error('Error processing PDF for ZIP:', fileError);
          sourceFailures += 1;
          if (sourceFailures >= MAX_SOURCE_FAILURES) break;
        }
        // Continue with other files
      }
    }

    // Finalize the archive
    if (archiveFailure) throw archiveFailure;
    const finalization = await Promise.race([
      archiveError.then((failure) => ({ failure })),
      archive.finalize().then(() => ({ failure: null as Error | null })),
    ]);
    if (finalization.failure) throw finalization.failure;

  } catch (err) {
    error('ZIP creation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP file' });
    } else if (!res.writableEnded && typeof res.destroy === 'function') {
      res.destroy(err instanceof Error ? err : undefined);
    }
    return;
  } finally {
    if (archiveTimeout) clearTimeout(archiveTimeout);
  }
}
