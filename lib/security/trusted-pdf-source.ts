import fs from 'fs';
import path from 'path';
import { getGeneratedDir } from '@/lib/paths';
import { verifySignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import storageConfig from '@/lib/storage-config';
import { getPublicUrl as getR2SignedUrl } from '@/lib/r2-client';
import { getS3SignedUrl } from '@/lib/s3-client';

const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
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
  source: 'local' | 'remote';
}

export interface LoadTrustedPdfOptions {
  /** Optional smaller timeout for callers with an overall operation deadline. */
  timeoutMs?: number;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMaxPdfSourceBytes(): number {
  return positiveInteger(process.env.MAX_PDF_SOURCE_SIZE_BYTES, DEFAULT_MAX_PDF_BYTES);
}

function getFetchTimeoutMs(): number {
  return positiveInteger(process.env.PDF_SOURCE_FETCH_TIMEOUT_MS, DEFAULT_FETCH_TIMEOUT_MS);
}

interface StorageBase {
  origin: string;
  pathPrefix: string;
}

function configuredStorageBases(): StorageBase[] {
  const bases = new Map<string, StorageBase>();

  const addConfiguredBase = (value: string | undefined) => {
    if (!value) return;
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
        const pathPrefix = parsed.pathname === '/'
          ? '/'
          : `${parsed.pathname.replace(/\/+$/, '')}/`;
        bases.set(`${parsed.origin}${pathPrefix}`, { origin: parsed.origin, pathPrefix });
      }
    } catch {
      // Invalid server configuration is ignored and therefore fails closed.
    }
  };

  addConfiguredBase(process.env.R2_ENDPOINT);
  addConfiguredBase(process.env.R2_PUBLIC_URL);
  addConfiguredBase(process.env.S3_CLOUDFRONT_URL);

  const bucket = process.env.S3_BUCKET_NAME;
  if (bucket) {
    const region = process.env.S3_REGION || 'us-east-1';
    addConfiguredBase(`https://${bucket}.s3.${region}.amazonaws.com`);
    addConfiguredBase(`https://${bucket}.s3.amazonaws.com`);
  }

  return [...bases.values()];
}

export function validateTrustedRemotePdfUrl(value: string): URL {
  if (value.length > MAX_SOURCE_LENGTH) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF source URL is too long', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid PDF source URL', 400);
  }

  if (parsed.username || parsed.password) {
    throw new PdfSourceError('INVALID_SOURCE', 'URL credentials are not allowed', 400);
  }

  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
    throw new PdfSourceError('INVALID_SOURCE', 'Only HTTPS PDF sources are allowed', 400);
  }

  const matchesConfiguredBase = configuredStorageBases().some((base) => {
    if (parsed.origin !== base.origin) return false;
    if (base.pathPrefix === '/') return true;
    return parsed.pathname === base.pathPrefix.slice(0, -1)
      || parsed.pathname.startsWith(base.pathPrefix);
  });

  if (!matchesConfiguredBase) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF source is not an approved storage origin', 403);
  }

  return parsed;
}

function isWithin(baseDir: string, candidate: string): boolean {
  const relative = path.relative(baseDir, candidate);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function resolveManagedLocalPdfPath(value: string): string {
  if (!value.startsWith('/')) {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid local PDF source', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(value, 'http://local.invalid');
  } catch {
    throw new PdfSourceError('INVALID_SOURCE', 'Invalid local PDF source', 400);
  }

  let relativePath: string;
  if (parsed.pathname === '/api/files/download') {
    const signedPath = parsed.searchParams.get('path');
    const expires = parsed.searchParams.get('expires');
    const signature = parsed.searchParams.get('signature');
    if (!signedPath || !expires || !signature) {
      throw new PdfSourceError('INVALID_SOURCE', 'Incomplete signed PDF source', 400);
    }
    try {
      relativePath = verifySignedGeneratedFileUrl(signedPath, expires, signature);
    } catch {
      throw new PdfSourceError('INVALID_SOURCE', 'Invalid signed PDF source', 403);
    }
  } else {
    throw new PdfSourceError('INVALID_SOURCE', 'A signed generated PDF source is required', 403);
  }

  if (!relativePath || relativePath.includes('\0') || path.extname(relativePath).toLowerCase() !== '.pdf') {
    throw new PdfSourceError('INVALID_SOURCE', 'Only generated PDF files are allowed', 400);
  }

  const baseDir = path.resolve(getGeneratedDir());
  const candidate = path.resolve(baseDir, relativePath);
  if (!isWithin(baseDir, candidate)) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF path escapes generated storage', 403);
  }

  return candidate;
}

export function assertPdfBuffer(buffer: Buffer): void {
  const headerWindow = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (headerWindow.indexOf(PDF_HEADER) === -1) {
    throw new PdfSourceError('INVALID_PDF', 'Source is not a valid PDF', 415);
  }
}

async function readResponseBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength) {
    const parsedLength = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new PdfSourceError('PDF_TOO_LARGE', 'PDF source exceeds the size limit', 413);
    }
  }

  if (!response.body) {
    throw new PdfSourceError('FETCH_FAILED', 'PDF source returned an empty response', 502);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('PDF source exceeds the size limit').catch(() => undefined);
        throw new PdfSourceError('PDF_TOO_LARGE', 'PDF source exceeds the size limit', 413);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchTrustedRemotePdf(
  value: string,
  maxBytes: number,
  requestedTimeoutMs?: number
): Promise<Buffer> {
  const url = validateTrustedRemotePdfUrl(value);
  const configuredTimeoutMs = getFetchTimeoutMs();
  const timeoutMs = requestedTimeoutMs === undefined
    ? configuredTimeoutMs
    : Math.min(configuredTimeoutMs, requestedTimeoutMs);

  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new PdfSourceError('FETCH_FAILED', 'PDF source request timed out', 504);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new PdfSourceError('NOT_FOUND', 'PDF source was not found', 404);
      }
      throw new PdfSourceError('FETCH_FAILED', 'Unable to retrieve PDF source', 502);
    }

    const buffer = await readResponseBody(response, maxBytes);
    assertPdfBuffer(buffer);
    return buffer;
  } catch (error) {
    if (error instanceof PdfSourceError) throw error;
    if (controller.signal.aborted) {
      throw new PdfSourceError('FETCH_FAILED', 'PDF source request timed out', 504);
    }
    throw new PdfSourceError('FETCH_FAILED', 'Unable to retrieve PDF source', 502);
  } finally {
    clearTimeout(timeout);
  }
}

function readManagedLocalPdf(value: string, maxBytes: number): Buffer {
  const filePath = resolveManagedLocalPdfPath(value);
  if (!fs.existsSync(filePath)) {
    throw new PdfSourceError('NOT_FOUND', 'PDF source was not found', 404);
  }

  let realBaseDir: string;
  let realFilePath: string;
  try {
    realBaseDir = fs.realpathSync(path.resolve(getGeneratedDir()));
    realFilePath = fs.realpathSync(filePath);
  } catch {
    throw new PdfSourceError('NOT_FOUND', 'PDF source was not found', 404);
  }

  if (!isWithin(realBaseDir, realFilePath)) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF path escapes generated storage', 403);
  }

  const stat = fs.statSync(realFilePath);
  if (!stat.isFile()) {
    throw new PdfSourceError('INVALID_SOURCE', 'PDF source is not a file', 400);
  }
  if (stat.size > maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF source exceeds the size limit', 413);
  }

  const buffer = fs.readFileSync(realFilePath);
  if (buffer.length > maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF source exceeds the size limit', 413);
  }
  assertPdfBuffer(buffer);
  return buffer;
}

export async function loadTrustedPdf(
  value: string,
  maxBytes = getMaxPdfSourceBytes(),
  options: LoadTrustedPdfOptions = {}
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

  let parsedSource: URL | null = null;
  try {
    parsedSource = new URL(value, 'http://local.invalid');
  } catch {
    // The existing local/remote validation below will produce the public error.
  }

  if (parsedSource?.pathname === '/api/files/download') {
    const signedPath = parsedSource.searchParams.get('path');
    const expires = parsedSource.searchParams.get('expires');
    const signature = parsedSource.searchParams.get('signature');
    if (!signedPath || !expires || !signature) {
      throw new PdfSourceError('INVALID_SOURCE', 'Incomplete signed PDF source', 400);
    }

    let verifiedPath: string;
    try {
      verifiedPath = verifySignedGeneratedFileUrl(signedPath, expires, signature);
    } catch {
      throw new PdfSourceError('INVALID_SOURCE', 'Invalid signed PDF source', 403);
    }

    if (storageConfig.isR2Enabled) {
      const providerUrl = await getR2SignedUrl(`generated/${verifiedPath}`);
      return { buffer: await fetchTrustedRemotePdf(providerUrl, effectiveMaxBytes, options.timeoutMs), source: 'remote' };
    }
    if (storageConfig.isS3Enabled) {
      const providerUrl = await getS3SignedUrl(`generated/${verifiedPath}`);
      return { buffer: await fetchTrustedRemotePdf(providerUrl, effectiveMaxBytes, options.timeoutMs), source: 'remote' };
    }
    return { buffer: readManagedLocalPdf(parsedSource.pathname + parsedSource.search, effectiveMaxBytes), source: 'local' };
  }

  if (/^https?:\/\//i.test(value)) {
    return {
      buffer: await fetchTrustedRemotePdf(value, effectiveMaxBytes, options.timeoutMs),
      source: 'remote'
    };
  }

  return { buffer: readManagedLocalPdf(value, effectiveMaxBytes), source: 'local' };
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
