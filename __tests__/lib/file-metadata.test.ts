import { normalizeStoredMetadata, readFileMetadata } from '@/lib/storage/file-metadata';

describe('storage file metadata parsing', () => {
  it('reads emailSent and downloadCount from lowercased provider keys', () => {
    // S3/R2 return custom metadata keys lowercased.
    const raw = {
      type: 'bulk',
      created: '2026-01-01T00:00:00.000Z',
      retention: '7d',
      emailsent: 'true',
      downloadcount: '3',
    };
    const parsed = readFileMetadata(raw);
    expect(parsed).toEqual({
      type: 'bulk',
      created: '2026-01-01T00:00:00.000Z',
      retention: '7d',
      emailSent: 'true',
      downloadCount: '3',
    });
  });

  it('still reads camelCase keys (idempotent)', () => {
    const parsed = readFileMetadata({
      type: 'individual',
      created: '2026-01-02T00:00:00.000Z',
      retention: '90d',
      emailSent: 'true',
    });
    expect(parsed?.emailSent).toBe('true');
    expect(parsed?.retention).toBe('90d');
  });

  it('treats a missing emailSent flag as false and defaults sensibly', () => {
    const parsed = readFileMetadata({ created: '2026-01-03T00:00:00.000Z' });
    expect(parsed?.emailSent).toBe('false');
    expect(parsed?.retention).toBe('permanent');
    expect(parsed?.type).toBe('template');
    expect(parsed?.downloadCount).toBe('0');
  });

  it('rejects unknown retention/type values, falling back to safe defaults', () => {
    const parsed = readFileMetadata({ retention: 'forever', type: 'weird' });
    expect(parsed?.retention).toBe('permanent');
    expect(parsed?.type).toBe('template');
  });

  it('returns null when there is no metadata', () => {
    expect(readFileMetadata(undefined)).toBeNull();
    expect(readFileMetadata(null)).toBeNull();
  });

  it('lowercases all keys, letting a later update overwrite a stored flag', () => {
    const merged = {
      ...normalizeStoredMetadata({ emailsent: 'false', retention: '7d', created: 'x' }),
      ...normalizeStoredMetadata({ emailSent: 'true', retention: '90d' }),
    };
    // No colliding emailsent/emailSent pair survives the merge.
    expect(merged).toEqual({ emailsent: 'true', retention: '90d', created: 'x' });
  });
});
