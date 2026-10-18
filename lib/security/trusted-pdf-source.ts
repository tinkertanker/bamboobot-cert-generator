import path from 'path';
import { verifySignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { getObjectBytes } from '@/lib/storage/bucket';

const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_LENGTH = 8_192;
const PDF_HEADER = Buffer.from('%PDF-');

export type PdfSourceErrorCode =
  | 'INVALID_SOURCE'
  | 'NOT_FOUND'
  | 'FETCH_FAILED'
  | 'PDF_TOO_LARGE'
  | 'INVALID_PDF';

export class PdfSourceError extends Error {
  constructor(
    public readonly code: PdfSourceErrorCode,
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'PdfSourceError';
  }
}

export interface TrustedPdf {
  buffer: Buffer;
  source: 'storage';
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  // Number() rejects trailing garbage ("10MB") that parseInt would silently
  // truncate into a tiny — and effectively service-breaking — limit.
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMaxPdfSourceBytes(): number {
  return positiveInteger(process.env.MAX_PDF_SOURCE_SIZE_BYTES, DEFAULT_MAX_PDF_BYTES);
}

/**
 * Resolve a signed `/api/files/download?...` URL (relative, or absolute on any
 * host) to the generated file's path inside storage. Only links the server
 * signed are accepted, so a request can never make the server read another
 * user's files or fetch an arbitrary URL.
 */
export function resolveSignedGeneratedPdfPath(value: string): string {
  if (value.length > MAX_SOURCE_LENGTH) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF source URL is too long', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'http://local.invalid');
  } catch {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid PDF source', 400);
  }

  if (parsed.pathname !== '/api/files/download') {
    throw new PdfSourceError('INVALID_SOURCE', 'A signed generated PDF source is required', 403);
  }

  const signedPath = parsed.searchParams.get('path');
  const expires = parsed.searchParams.get('expires');
  const signature = parsed.searchParams.get('signature');
  if (!signedPath || !expires || !signature) {
    throw new PdfSourceError('INVALID_SOURCE', 'Incomplete signed PDF source', 400);
  }

  let relativePath: string;
  try {
    relativePath = verifySignedGeneratedFileUrl(signedPath, expires, signature);
  } catch {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid signed PDF source', 403);
  }

  if (!relativePath || relativePath.includes('\0') || path.posix.extname(relativePath).toLowerCase() !== '.pdf') {
    throw new PdfSourceError('INVALID_SOURCE', 'Only generated PDF files are allowed', 400);
  }
  return relativePath;
}

export function assertPdfBuffer(buffer: Buffer): void {
  const headerWindow = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (headerWindow.indexOf(PDF_HEADER) === -1) {
    throw new PdfSourceError('INVALID_PDF', 'Source is not a valid PDF', 415);
  }
}

/** Load a generated PDF named by a signed download URL from storage. */
export async function loadTrustedPdf(
  value: string,
  maxBytes = getMaxPdfSourceBytes()
): Promise<TrustedPdf> {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF source is required', 400);
  }

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid PDF source size limit', 500);
  }

  // Callers may request a smaller budget (for example, the remaining ZIP
  // budget), but may never raise the configured per-source ceiling.
  const effectiveMaxBytes = Math.min(maxBytes, getMaxPdfSourceBytes());
  const relativePath = resolveSignedGeneratedPdfPath(value);

  let bytes: Uint8Array | null;
  try {
    bytes = await getObjectBytes(`generated/${relativePath}`, effectiveMaxBytes);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new PdfSourceError('PDF_TOO_LARGE', 'PDF source exceeds the size limit', 413);
    }
    throw new PdfSourceError('FETCH_FAILED', 'Unable to retrieve PDF source', 502);
  }
  if (!bytes) {
    throw new PdfSourceError('NOT_FOUND', 'PDF source was not found', 404);
  }

  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assertPdfBuffer(buffer);
  return { buffer, source: 'storage' };
}

export function sanitizePdfFilename(value: unknown, fallback = 'download.pdf'): string {
  const fallbackBasename = path.basename(fallback).replace(/[^a-zA-Z0-9._ -]/g, '_') || 'download';
  const fallbackStem = fallbackBasename.toLowerCase().endsWith('.pdf')
    ? fallbackBasename.slice(0, -4)
    : fallbackBasename;
  const safeFallback = `${fallbackStem.slice(0, 176).replace(/[ .]+$/, '') || 'download'}.pdf`;
  if (typeof value !== 'string') return safeFallback;

  const basename = path.basename(value)
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!basename) return safeFallback;

  const stem = basename.toLowerCase().endsWith('.pdf') ? basename.slice(0, -4) : basename;
  const safeStem = stem.slice(0, 176).replace(/[ .]+$/, '') || 'download';
  return `${safeStem}.pdf`;
}
