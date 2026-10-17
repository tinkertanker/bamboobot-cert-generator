/**
 * Font sizes are stored relative to a fixed reference preview width, so a
 * field's size means the same thing on every screen. The preview scales text
 * by (actual preview width / reference width) and PDF generation scales it by
 * (PDF page width / reference width). Neither depends on the browser window.
 *
 * 800px matches the server's long-standing default container width, and is
 * close to the preview width on a typical laptop.
 */
export const FONT_REFERENCE_WIDTH = 800;

/** Multiplier that turns a stored font size into preview pixels. */
export function getPreviewFontScale(previewWidth: number): number {
  if (!Number.isFinite(previewWidth) || previewWidth <= 0) return 1;
  return previewWidth / FONT_REFERENCE_WIDTH;
}

/**
 * Dimensions to send as `uiContainerDimensions` when generating PDFs.
 * The width is always the reference width; the height keeps the template's
 * aspect ratio when the preview image is available.
 */
export function getFontReferenceDimensions(): { width: number; height: number } {
  const width = FONT_REFERENCE_WIDTH;
  if (typeof document !== 'undefined') {
    const img = document.querySelector('.image-container img') as HTMLImageElement | null;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return { width, height: Math.round(width * (img.naturalHeight / img.naturalWidth)) };
    }
  }
  return { width, height: Math.round(width * 0.75) };
}
