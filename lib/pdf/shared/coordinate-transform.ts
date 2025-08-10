/**
 * Shared coordinate transformation utilities for PDF generation
 * Handles conversion between UI coordinates (top-left origin) and PDF coordinates (bottom-left origin)
 */

export interface Dimensions {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface TextBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Convert UI Y coordinate (top-left origin) to PDF Y coordinate (bottom-left origin)
 * @param uiY - Y coordinate in UI space (0-1 normalized)
 * @param pdfHeight - Height of the PDF page
 * @returns Y coordinate in PDF space
 */
export function uiToPdfY(uiY: number, pdfHeight: number): number {
  return pdfHeight - (uiY * pdfHeight);
}

/**
 * Convert UI coordinates to PDF coordinates
 * @param uiPoint - Point in UI space (0-1 normalized)
 * @param pdfDimensions - PDF page dimensions
 * @returns Point in PDF space
 */
export function uiToPdfCoordinates(
  uiPoint: Point,
  pdfDimensions: Dimensions
): Point {
  return {
    x: uiPoint.x * pdfDimensions.width,
    y: uiToPdfY(uiPoint.y, pdfDimensions.height)
  };
}

/**
 * Calculate text box bounds based on alignment and width
 * @param xPos - X position (meaning depends on alignment)
 * @param alignment - Text alignment (left, center, right)
 * @param maxWidth - Maximum width of text box
 * @returns Text box bounds
 */
export function calculateTextBoxBounds(
  xPos: number,
  alignment: 'left' | 'center' | 'right',
  maxWidth: number
): { left: number; right: number } {
  let left: number;
  let right: number;

  switch (alignment) {
    case 'center':
      left = xPos - (maxWidth / 2);
      right = xPos + (maxWidth / 2);
      break;
    case 'right':
      left = xPos - maxWidth;
      right = xPos;
      break;
    case 'left':
    default:
      left = xPos;
      right = xPos + maxWidth;
      break;
  }

  return { left, right };
}

/**
 * Calculate X position for text within a text box based on alignment
 * @param textWidth - Actual width of the text
 * @param textBoxBounds - Bounds of the text box
 * @param alignment - Text alignment
 * @returns X position for drawing text
 */
export function calculateTextXPosition(
  textWidth: number,
  textBoxBounds: { left: number; right: number },
  alignment: 'left' | 'center' | 'right'
): number {
  const boxWidth = textBoxBounds.right - textBoxBounds.left;

  switch (alignment) {
    case 'center':
      return textBoxBounds.left + (boxWidth - textWidth) / 2;
    case 'right':
      return textBoxBounds.right - textWidth;
    case 'left':
    default:
      return textBoxBounds.left;
  }
}

/**
 * Calculate Y position for multiline text
 * @param baseY - Base Y position in PDF coordinates
 * @param lineIndex - Index of the current line (0-based)
 * @param lineHeight - Height of each line
 * @param totalLines - Total number of lines
 * @param fontSize - Font size
 * @returns Y position for the specific line
 */
export function calculateMultilineY(
  baseY: number,
  lineIndex: number,
  lineHeight: number,
  totalLines: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _fontSize: number
): number {
  // Center multiline text vertically
  const totalTextHeight = lineHeight * (totalLines - 1);
  const centeredBaseY = baseY + (totalTextHeight / 2);
  
  // Calculate Y for specific line
  return centeredBaseY - (lineIndex * lineHeight);
}

/**
 * Scale font size based on container dimensions
 * @param baseFontSize - Base font size from UI
 * @param uiContainerWidth - Width of UI container
 * @param pdfWidth - Width of PDF page
 * @returns Scaled font size
 */
export function scaleFontSize(
  baseFontSize: number,
  uiContainerWidth: number,
  pdfWidth: number
): number {
  const scaleFactor = pdfWidth / uiContainerWidth;
  return baseFontSize * scaleFactor;
}

/**
 * Calculate vertical centering adjustment for text
 * This adjustment helps text sit better on lines
 * @param fontSize - Font size
 * @returns Y adjustment value
 */
export function getTextVerticalAdjustment(fontSize: number): number {
  return fontSize * 0.36;
}