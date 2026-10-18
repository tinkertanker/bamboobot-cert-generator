import { NextApiRequest, NextApiResponse } from 'next';
import { error } from '@/lib/log';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { StoreZipWriter } from '@/lib/zip/store-zip-writer';
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
  const userId = session.user.id;
  const rl = await enforceRateLimit(req, res, { userId, route: 'zip-pdfs', category: 'zip' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many ZIP downloads. Please wait and try again.' });
    return;
  }

  // The archive is streamed one PDF at a time, so memory stays bounded by the
  // largest single source rather than the whole ZIP.
  const writeChunk = (chunk: Uint8Array): Promise<void> =>
    new Promise((resolve, reject) => {
      if (res.writableEnded || res.destroyed) {
        reject(new Error('Client closed the ZIP download'));
        return;
      }
      if (res.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))) resolve();
      else res.once('drain', () => resolve());
    });

  try {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="certificates.zip"');
    res.setHeader('Cache-Control', 'private, no-store');

    const archive = new StoreZipWriter(writeChunk);
    let totalBytes = 0;
    let sourceFailures = 0;
    const deadlineAt = Date.now() + getMaxZipDurationMs();

    // Add each validated PDF to the archive. Each source and the aggregate
    // archive input are bounded to avoid turning this endpoint into a memory
    // or bandwidth amplifier.
    for (const file of files) {
      if (Date.now() >= deadlineAt) {
        throw new Error('ZIP generation timed out');
      }

      const remainingBytes = MAX_ZIP_BYTES - totalBytes;
      if (remainingBytes <= 0) {
        error('ZIP input limit reached; remaining files were skipped');
        break;
      }

      let buffer: Buffer;
      try {
        ({ buffer } = await loadTrustedPdf(file.url, Math.min(getMaxPdfSourceBytes(), remainingBytes)));
      } catch (fileError) {
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
        continue;
      }

      totalBytes += buffer.length;
      await archive.addFile(sanitizePdfFilename(file.filename, 'certificate.pdf'), buffer);
    }

    await archive.finish();
    res.end();
  } catch (err) {
    error('ZIP creation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP file' });
    } else if (!res.writableEnded && typeof res.destroy === 'function') {
      res.destroy(err instanceof Error ? err : undefined);
    }
  }
}
