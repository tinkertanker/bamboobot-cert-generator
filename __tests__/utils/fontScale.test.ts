import {
  FONT_REFERENCE_WIDTH,
  getPreviewFontScale,
  getFontReferenceDimensions
} from '@/utils/fontScale';
import { scaleFontSize } from '@/lib/pdf/shared/coordinate-transform';

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

  it('keeps text the same share of the page in preview and PDF', () => {
    const storedSize = 24;
    const pdfWidth = 842;
    const pdfSize = scaleFontSize(storedSize, getFontReferenceDimensions().width, pdfWidth);
    for (const previewWidth of [500, 800, 1300]) {
      const previewSize = storedSize * getPreviewFontScale(previewWidth);
      expect(previewSize / previewWidth).toBeCloseTo(pdfSize / pdfWidth, 10);
    }
  });
});
