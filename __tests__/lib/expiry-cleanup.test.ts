import { cleanupExpiredObjects, isExpired } from '@/lib/storage/expiry-cleanup';
import type { FileMetadata } from '@/lib/storage/file-metadata';
import { silenceConsole } from '../helpers/silence-console';

const NOW = new Date('2026-10-17T00:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

function meta(retention: FileMetadata['retention'], ageHours: number, emailSent: 'true' | 'false' = 'false'): FileMetadata {
  return { type: 'individual', created: hoursAgo(ageHours), retention, emailSent };
}

describe('isExpired', () => {
  it.each([
    ['24h', 25, true],
    ['24h', 23, false],
    ['7d', 7 * 24 + 1, true],
    ['7d', 6 * 24, false],
    ['90d', 91 * 24, true],
    ['90d', 89 * 24, false],
    ['permanent', 10_000 * 24, false],
  ] as const)('%s retention at %d hours old -> %s', (retention, age, expected) => {
    expect(isExpired(meta(retention, age), NOW)).toBe(expected);
  });

  it('keeps emailed files regardless of age', () => {
    expect(isExpired(meta('24h', 1000, 'true'), NOW)).toBe(false);
  });

  it('keeps files with a missing or invalid created date', () => {
    expect(isExpired({ type: 'preview', created: '', retention: '24h' }, NOW)).toBe(false);
    expect(isExpired({ type: 'preview', created: 'not-a-date', retention: '24h' }, NOW)).toBe(false);
  });
});

describe('cleanupExpiredObjects', () => {
  silenceConsole();

  const store: Record<string, FileMetadata | null> = {
    'generated/preview_old.pdf': meta('24h', 48),
    'generated/preview_new.pdf': meta('24h', 1),
    'generated/certificates_old.pdf': meta('7d', 24 * 8),
    'temp_images/template.png': meta('permanent', 24 * 400),
    'generated/no-metadata.pdf': null,
    'generated/broken.pdf': meta('24h', 48),
  };
  const files = Object.keys(store).map(key => ({ key }));

  it('deletes only expired files and reports failures in listing order', async () => {
    const deleteObject = jest.fn(async (key: string) => {
      if (key === 'generated/broken.pdf') throw new Error('denied');
    });

    const result = await cleanupExpiredObjects(files, {
      getMetadata: async key => store[key],
      deleteObject,
      now: NOW,
      concurrency: 3,
    });

    expect(result.deleted).toEqual(['generated/preview_old.pdf', 'generated/certificates_old.pdf']);
    expect(result.errors).toEqual(['generated/broken.pdf']);
    expect(deleteObject).toHaveBeenCalledTimes(3);
  });

  it('treats a metadata lookup failure as an error and carries on', async () => {
    const result = await cleanupExpiredObjects(files, {
      getMetadata: async key => {
        if (key === 'generated/preview_new.pdf') throw new Error('timeout');
        return store[key];
      },
      deleteObject: async () => undefined,
      now: NOW,
    });

    expect(result.errors).toEqual(['generated/preview_new.pdf']);
    expect(result.deleted).toContain('generated/preview_old.pdf');
  });

  it('deletes nothing on a dry run', async () => {
    const deleteObject = jest.fn();

    const result = await cleanupExpiredObjects(files, {
      getMetadata: async key => store[key],
      deleteObject,
      now: NOW,
      dryRun: true,
    });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(result.deleted).toEqual([
      'generated/preview_old.pdf',
      'generated/certificates_old.pdf',
      'generated/broken.pdf',
    ]);
  });

  it('handles an empty listing', async () => {
    const result = await cleanupExpiredObjects([], {
      getMetadata: jest.fn(),
      deleteObject: jest.fn(),
    });
    expect(result).toEqual({ deleted: [], errors: [] });
  });
});
