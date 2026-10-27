import {
  FONT_REFERENCE_WIDTH,
  getPreviewFontScale,
  getFontReferenceDimensions
} from '@/utils/fontScale';
import { PDFDocument } from 'pdf-lib';
import { addTextToPage, embedStandardFonts } from '@/lib/pdf/shared/pdf-generation-core';
import { readPdfText } from '../helpers/pdf-text';

describe('font scaling', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scales preview text with the preview width', () => {
    expect(getPreviewFontScale(FONT_REFERENCE_WIDTH)).toBe(1);
    expect(getPreviewFontScale(400)).toBe(0.5);
    expect(getPreviewFontScale(0)).toBe(1);
  });

  it('sends a fixed width for PDF generation whatever the preview size', () => {
    document.body.innerHTML = '<div class="image-container"><img /></div>';
    const img = document.querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'offsetWidth', { value: 1234 });
    Object.defineProperty(img, 'naturalWidth', { value: 2000 });
    Object.defineProperty(img, 'naturalHeight', { value: 1414 });

    expect(getFontReferenceDimensions()).toEqual({ width: FONT_REFERENCE_WIDTH, height: 566 });
  });

  it('keeps text the same share of the page in preview and generated PDF', async () => {
    const storedSize = 24;
    const pdfWidth = 842;
    const pdf = await PDFDocument.create();
    const fonts = await embedStandardFonts(pdf);
    addTextToPage(pdf.addPage([pdfWidth, 595]), { name: { text: 'Ada' } }, {
      name: { x: 0.2, y: 0.3, fontSize: storedSize },
    }, fonts, getFontReferenceDimensions());
    const drawn = await readPdfText(pdf);
    expect(drawn).toHaveLength(1);
    expect(drawn[0].text).toBe('Ada');
    for (const previewWidth of [500, 800, 1300]) {
      const previewSize = storedSize * getPreviewFontScale(previewWidth);
      expect(previewSize / previewWidth).toBeCloseTo(drawn[0].size / pdfWidth, 10);
    }
  });
});
