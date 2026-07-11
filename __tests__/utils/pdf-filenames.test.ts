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
});
