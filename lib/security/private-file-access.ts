import path from 'path';
import { readStaticAsset } from '@/lib/cloudflare/assets';
import { getObjectBytes } from '@/lib/storage/bucket';

export class PrivateFileAccessError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'PrivateFileAccessError';
  }
}

/** Largest certificate template the server will load. */
export const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;

export type AuthorizedTemplateSource =
  | { kind: 'asset'; path: string }
  | { kind: 'object'; key: string };

/**
 * Check that a template filename sent by the client belongs to the current
 * user (or is the bundled Dev Mode template) and say where it is stored.
 */
export function getAuthorizedTemplateSource(templateFilename: string, userId: string): AuthorizedTemplateSource {
  if (
    typeof templateFilename !== 'string' ||
    !templateFilename ||
    templateFilename.includes('\\') ||
    templateFilename.includes('\0') ||
    templateFilename.endsWith('/')
  ) {
    throw new PrivateFileAccessError('Invalid template path', 400);
  }
  if (/^dev-mode-template\.pdf$/i.test(templateFilename)) {
    return { kind: 'asset', path: `/template_images/${templateFilename}` };
  }
  const normalized = path.posix.normalize(templateFilename);
  if (
    !templateFilename.startsWith(`u_${userId}/`) ||
    normalized !== templateFilename ||
    normalized.split('/').some(segment => segment === '..' || segment === '.')
  ) {
    throw new PrivateFileAccessError('Template does not belong to the current user', 403);
  }
  return { kind: 'object', key: `temp_images/${templateFilename}` };
}

/** Load an authorised template's bytes, or null when it does not exist. */
export async function loadAuthorizedTemplate(templateFilename: string, userId: string): Promise<Uint8Array | null> {
  const source = getAuthorizedTemplateSource(templateFilename, userId);
  if (source.kind === 'asset') return readStaticAsset(source.path);
  try {
    return await getObjectBytes(source.key, MAX_TEMPLATE_BYTES);
  } catch (error) {
    if (error instanceof RangeError) throw new PrivateFileAccessError('Template is too large', 413);
    throw error;
  }
}
