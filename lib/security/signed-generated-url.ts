import crypto from 'crypto';
import path from 'path';

const DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;

export class SignedFileUrlError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SignedFileUrlError';
  }
}

function signingSecret(): string {
  const secret = process.env.FILE_URL_SIGNING_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'bamboobot-local-development-only';
  throw new SignedFileUrlError('File URL signing is not configured', 500);
}

export function normalizeGeneratedPdfPath(value: string): string {
  if (!value || value.includes('\0') || value.includes('\\')) {
    throw new SignedFileUrlError('Invalid generated file path', 400);
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new SignedFileUrlError('Invalid generated file path', 400);
  }

  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '');
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized) ||
    path.posix.extname(normalized).toLowerCase() !== '.pdf'
  ) {
    throw new SignedFileUrlError('Invalid generated PDF path', 400);
  }
  return normalized;
}

function signatureFor(relativePath: string, expires: number): string {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`${relativePath}\n${expires}`)
    .digest('base64url');
}

export function createSignedGeneratedFileUrl(
  relativePath: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  nowMs: number = Date.now(),
): string {
  const normalizedPath = normalizeGeneratedPdfPath(relativePath);
  const safeTtl = Number.isFinite(ttlSeconds)
    ? Math.min(Math.max(Math.floor(ttlSeconds), 1), MAX_TTL_SECONDS)
    : DEFAULT_TTL_SECONDS;
  const expires = Math.floor(nowMs / 1000) + safeTtl;
  const signature = signatureFor(normalizedPath, expires);
  const params = new URLSearchParams({
    path: normalizedPath,
    expires: String(expires),
    signature,
  });
  const relativeUrl = `/api/files/download?${params.toString()}`;
  const appOrigin = process.env.NEXTAUTH_URL;
  if (appOrigin) {
    try {
      const absoluteUrl = new URL(relativeUrl, appOrigin);
      if (absoluteUrl.protocol === 'https:' || (absoluteUrl.protocol === 'http:' && process.env.NODE_ENV !== 'production')) {
        return absoluteUrl.toString();
      }
    } catch {
      // Invalid application origin falls back to a same-origin URL.
    }
  }
  return relativeUrl;
}

export function verifySignedGeneratedFileUrl(
  relativePath: string,
  expiresValue: string,
  providedSignature: string,
  nowMs: number = Date.now(),
): string {
  const normalizedPath = normalizeGeneratedPdfPath(relativePath);
  if (!/^\d+$/.test(expiresValue)) {
    throw new SignedFileUrlError('Invalid file URL expiry', 400);
  }

  const expires = Number(expiresValue);
  const now = Math.floor(nowMs / 1000);
  if (!Number.isSafeInteger(expires) || expires < now) {
    throw new SignedFileUrlError('File URL has expired', 410);
  }
  if (expires - now > MAX_TTL_SECONDS) {
    throw new SignedFileUrlError('File URL expiry is invalid', 403);
  }

  const expectedSignature = signatureFor(normalizedPath, expires);
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature || '');
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new SignedFileUrlError('Invalid file URL signature', 403);
  }
  return normalizedPath;
}

export function verifySignedGeneratedFileCapabilityUrl(
  fileUrl: string,
  userId: string,
  nowMs: number = Date.now(),
): string {
  if (typeof fileUrl !== 'string' || fileUrl !== fileUrl.trim() || fileUrl.includes('\\')) {
    throw new SignedFileUrlError('Invalid generated file URL', 400);
  }
  const isRelativeUrl = fileUrl.startsWith('/') && !fileUrl.startsWith('//');
  const isAbsoluteHttpUrl = /^https?:\/\//i.test(fileUrl);
  if (!isRelativeUrl && !isAbsoluteHttpUrl) {
    throw new SignedFileUrlError('Invalid generated file URL', 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(fileUrl, 'http://local.invalid');
  } catch {
    throw new SignedFileUrlError('Invalid generated file URL', 400);
  }
  if (isAbsoluteHttpUrl) {
    const configuredOrigin = process.env.NEXTAUTH_URL;
    let appOrigin: string;
    try {
      appOrigin = configuredOrigin ? new URL(configuredOrigin).origin : '';
    } catch {
      appOrigin = '';
    }
    if (!appOrigin || parsed.origin !== appOrigin) {
      throw new SignedFileUrlError('Generated file URL has an invalid origin', 403);
    }
  } else if (parsed.origin !== 'http://local.invalid') {
    throw new SignedFileUrlError('Generated file URL has an invalid origin', 403);
  }
  if (parsed.pathname !== '/api/files/download') {
    throw new SignedFileUrlError('Invalid generated file URL', 400);
  }
  const signedPath = parsed.searchParams.get('path');
  const expires = parsed.searchParams.get('expires');
  const signature = parsed.searchParams.get('signature');
  if (!signedPath || !expires || !signature) {
    throw new SignedFileUrlError('Invalid generated file URL', 400);
  }
  const verifiedPath = verifySignedGeneratedFileUrl(signedPath, expires, signature, nowMs);
  if (!verifiedPath.startsWith(`u_${userId}/`)) {
    throw new SignedFileUrlError('Generated file does not belong to the current user', 403);
  }
  return verifiedPath;
}
