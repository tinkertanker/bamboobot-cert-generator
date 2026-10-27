import { calculateShrinkToFitFontSize, splitTextIntoLines } from '@/utils/pdf-text-utils';
import type { PDFFont } from 'pdf-lib';

describe('bounded PDF text fitting', () => {
  it.each([Infinity, NaN, 1e308, '1e308'])('rejects invalid font size %s before measuring', size => {
    const font = { widthOfTextAtSize: () => { throw new Error('measurement must not run'); } } as unknown as PDFFont;
    expect(() => calculateShrinkToFitFontSize('Name', 100, size as number, font)).toThrow('Invalid text layout');
  });

  it('truncates a long final line with bounded cumulative measurement work', () => {
    let glyphs = 0;
    const font = { widthOfTextAtSize: (text: string) => {
      glyphs += text.length;
      if (glyphs > 100_000) throw new Error('excessive glyph processing');
      return text.length * 5;
    } } as unknown as PDFFont;
    expect(splitTextIntoLines('x'.repeat(2000) + ' y', 50, font, 10, 1)).toEqual(['xxxxxxx...']);
  });
});
