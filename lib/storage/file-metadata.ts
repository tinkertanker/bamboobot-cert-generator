/**
 * Shared representation and parsing for the custom object metadata attached to
 * files stored in S3-compatible providers (Amazon S3, Cloudflare R2).
 *
 * Both providers store user metadata keys **lowercased** and return them
 * lowercased from HeadObject/ListObjects. Reading a camelCase key such as
 * `metadata.emailSent` therefore silently misses the stored `emailsent` value,
 * which previously caused emailed files to be treated as not-emailed and
 * deleted at their base retention instead of having retention extended.
 */

export interface FileMetadata {
  type: 'preview' | 'individual' | 'bulk' | 'template';
  created: string;
  retention: '24h' | '7d' | '90d' | 'permanent';
  emailSent?: 'true' | 'false';
  downloadCount?: string;
}

const RETENTIONS: ReadonlyArray<FileMetadata['retention']> = ['24h', '7d', '90d', 'permanent'];
const TYPES: ReadonlyArray<FileMetadata['type']> = ['preview', 'individual', 'bulk', 'template'];

/**
 * Lowercase every key of a raw provider metadata record so lookups are
 * case-insensitive regardless of how the value was originally written.
 */
export function normalizeStoredMetadata(
  raw?: Record<string, string> | null
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

/**
 * Parse raw provider metadata into a typed FileMetadata, reading each field by
 * its lowercased key. Returns null when no metadata is present.
 */
export function readFileMetadata(
  raw?: Record<string, string> | null
): FileMetadata | null {
  if (!raw) return null;
  const m = normalizeStoredMetadata(raw);
  const type = TYPES.includes(m.type as FileMetadata['type'])
    ? (m.type as FileMetadata['type'])
    : 'template';
  const retention = RETENTIONS.includes(m.retention as FileMetadata['retention'])
    ? (m.retention as FileMetadata['retention'])
    : 'permanent';
  return {
    type,
    created: m.created ?? '',
    retention,
    emailSent: m.emailsent === 'true' ? 'true' : 'false',
    downloadCount: m.downloadcount ?? '0',
  };
}
