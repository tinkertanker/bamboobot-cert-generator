/** @jest-environment node */
import { PDFDocument } from 'pdf-lib';
import { addTextToPage, embedStandardFonts } from '@/lib/pdf/shared/pdf-generation-core';
import { readPdfText } from '../../helpers/pdf-text';

describe('PDF text layout in generated output', () => {
  it('anchors left, centre and right text and converts top-origin Y on a non-square page', async () => {
    const pdf = await PDFDocument.create();
    const fonts = await embedStandardFonts(pdf);
    for (const alignment of ['left', 'center', 'right'] as const) {
      addTextToPage(pdf.addPage([600, 800]), { name: { text: 'AB' } }, {
        name: { x: 0.3, y: 0.2, width: 40, font: 'Courier', fontSize: 32, alignment },
      }, fonts, { width: 800, height: 600 });
    }
    // Courier has 600-unit glyphs: two letters at 24pt occupy 28.8pt.
    const drawn = await readPdfText(pdf);
    expect(drawn).toHaveLength(3);
    for (const [index, x] of [180, 165.6, 151.2].entries()) {
      expect(drawn[index]).toMatchObject({ text: 'AB', size: 24 });
      expect(drawn[index].x).toBeCloseTo(x, 8);
      expect(drawn[index].y).toBeCloseTo(630.88, 8);
    }
  });

  it('wraps into separately centred lines around the requested vertical anchor', async () => {
    const pdf = await PDFDocument.create();
    const fonts = await embedStandardFonts(pdf);
    addTextToPage(pdf.addPage([600, 800]), { name: { text: 'ALPHA BETA' } }, {
      name: { x: 0.3, y: 0.2, width: 15, font: 'Courier', fontSize: 32,
        alignment: 'center', textMode: 'multiline', lineHeight: 1.2 },
    }, fonts, { width: 800, height: 600 });
    const drawn = await readPdfText(pdf);
    expect(drawn).toHaveLength(2);
    expect(drawn[0]).toMatchObject({ text: 'ALPHA', size: 24, x: 144 });
    expect(drawn[1]).toMatchObject({ text: 'BETA', size: 24, x: 151.2 });
    expect(drawn[0].y).toBeCloseTo(645.28, 8);
    expect(drawn[1].y).toBeCloseTo(616.48, 8);
  });

  it('shrinks long text to the box within the half-point fitting tolerance without dropping characters', async () => {
    const pdf = await PDFDocument.create();
    const fonts = await embedStandardFonts(pdf);
    addTextToPage(pdf.addPage([600, 800]), { name: { text: 'ABCDEFGHIJ' } }, {
      name: { x: 0.1, y: 0.7, width: 12, font: 'Courier', fontSize: 32 },
    }, fonts, { width: 800, height: 600 });
    const drawn = await readPdfText(pdf);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ text: 'ABCDEFGHIJ', x: 60 });
    // Ten 600-unit glyphs must fit 72pt: the ideal size is 12pt.
    expect(Math.abs(drawn[0].size - 12)).toBeLessThanOrEqual(0.5);
    expect(drawn[0].y).toBeCloseTo(240 - drawn[0].size * 0.38, 8);
  });
});
