import {
  getPdfBaseFilename,
  UniquePdfFilenameAllocator
} from '@/utils/pdf-filenames';

describe('UniquePdfFilenameAllocator', () => {
  it('allocates duplicate names without restarting the suffix scan', () => {
    const allocator = new UniquePdfFilenameAllocator();

    expect(
      Array.from({ length: 5 }, () => allocator.allocate('Ada'))
    ).toEqual([
      'Ada.pdf',
      'Ada-1.pdf',
      'Ada-2.pdf',
      'Ada-3.pdf',
      'Ada-4.pdf'
    ]);
  });

  it('avoids collisions created by sanitization and explicit suffixes', () => {
    const allocator = new UniquePdfFilenameAllocator();

    expect([
      allocator.allocate('Ada Lovelace'),
      allocator.allocate('Ada_Lovelace'),
      allocator.allocate('Ada_Lovelace-1'),
      allocator.allocate('Ada Lovelace')
    ]).toEqual([
      'Ada_Lovelace.pdf',
      'Ada_Lovelace-1.pdf',
      'Ada_Lovelace-1-1.pdf',
      'Ada_Lovelace-2.pdf'
    ]);
  });

  it('reads entry-shaped and legacy naming values without stringifying objects', () => {
    expect(getPdfBaseFilename({ text: 'Ada' }, 'Certificate-1')).toBe('Ada');
    expect(getPdfBaseFilename('Grace', 'Certificate-1')).toBe('Grace');
    expect(getPdfBaseFilename({ color: [0, 0, 0] }, 'Certificate-1')).toBe(
      'Certificate-1'
    );
  });

  it('falls back to "certificate" for an empty base instead of an extension-only file', () => {
    const allocator = new UniquePdfFilenameAllocator();

    expect([
      allocator.allocate(''),
      allocator.allocate(''),
      allocator.allocate('')
    ]).toEqual(['certificate.pdf', 'certificate-1.pdf', 'certificate-2.pdf']);
  });

  it('sanitizes non-alphanumeric bases to underscores (pinned current behavior)', () => {
    const allocator = new UniquePdfFilenameAllocator();

    // Pinned, not endorsed: every non [a-zA-Z0-9-_] character becomes an
    // underscore, so unicode-only and whitespace-only bases collide.
    expect([
      allocator.allocate('日本語'),
      allocator.allocate('   ')
    ]).toEqual(['___.pdf', '___-1.pdf']);
  });

  it('handles adversarial naming values with the documented fallbacks', () => {
    // Numeric text is stringified
    expect(getPdfBaseFilename({ text: 123 }, 'Certificate-1')).toBe('123');
    // Empty-string text falls back
    expect(getPdfBaseFilename({ text: '' }, 'Certificate-1')).toBe(
      'Certificate-1'
    );
    // null and undefined fall back
    expect(getPdfBaseFilename(null, 'Certificate-1')).toBe('Certificate-1');
    expect(getPdfBaseFilename(undefined, 'Certificate-1')).toBe(
      'Certificate-1'
    );
    // Falsy 0 skips the entry-shape branch but is still stringified, not
    // treated as missing (pinned current behavior)
    expect(getPdfBaseFilename(0, 'Certificate-1')).toBe('0');
  });
});
