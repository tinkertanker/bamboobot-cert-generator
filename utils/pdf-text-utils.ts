import { PDFDocument } from 'pdf-lib';

type PDFFont = ReturnType<typeof PDFDocument.prototype.embedFont> extends Promise<infer T> ? T : never;

/**
 * Split text into lines for PDF rendering
 * Shared utility for both API routes and lib modules
 */
export function splitTextIntoLines(
  text: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number,
  maxLines: number = 2
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (lineWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      
      if (lines.length >= maxLines) {
        break;
      }
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  } else if (currentLine && lines.length === maxLines) {
    // Add ellipsis to last line if there's overflow
    const lastLine = lines[maxLines - 1];
    let truncatedLine = lastLine;
    while (font.widthOfTextAtSize(truncatedLine + '...', fontSize) > maxWidth && truncatedLine.length > 0) {
      truncatedLine = truncatedLine.slice(0, -1).trim();
    }
    if (truncatedLine) {
      lines[maxLines - 1] = truncatedLine + '...';
    }
  }
  
  return lines;
}

/**
 * Calculate font size to fit text within a given width (shrink-to-fit)
 * Shared utility for both API routes and lib modules
 */
export function calculateShrinkToFitFontSize(
  text: string,
  maxWidth: number,
  baseFontSize: number,
  font: PDFFont,
  minFontSize: number = 8
): number {
  let fontSize = baseFontSize;
  let textWidth = font.widthOfTextAtSize(text, fontSize);
  
  if (textWidth <= maxWidth) {
    return fontSize;
  }
  
  // Binary search for optimal font size
  let low = minFontSize;
  let high = baseFontSize;
  
  while (high - low > 0.5) {
    fontSize = (low + high) / 2;
    textWidth = font.widthOfTextAtSize(text, fontSize);
    
    if (textWidth > maxWidth) {
      high = fontSize;
    } else {
      low = fontSize;
    }
  }
  
  return Math.max(fontSize, minFontSize);
}