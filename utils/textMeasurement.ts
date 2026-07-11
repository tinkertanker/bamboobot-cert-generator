import type { FontFamily } from "@/types/certificate";

// Font family mapping for Canvas (matching CertificatePreview)
const fontFamilyMap: Record<FontFamily, string> = {
  Helvetica: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  Times: 'Times, "Times New Roman", Georgia, serif',
  Courier: 'Courier, "Courier New", monospace',
  Montserrat: '"Montserrat", sans-serif',
  Poppins: '"Poppins", sans-serif',
  SourceSansPro: '"Source Sans Pro", sans-serif',
  Nunito: '"Nunito", sans-serif',
  GreatVibes: '"Great Vibes", cursive',
  Archivo: '"Archivo", sans-serif',
  Rubik: '"Rubik", sans-serif'
};

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let isWatchingFontLoads = false;
const measurementCache = new Map<string, number>();
const MAX_MEASUREMENT_CACHE_ENTRIES = 2000;

function getContext(): CanvasRenderingContext2D {
  if (!isWatchingFontLoads && document.fonts?.addEventListener) {
    document.fonts.addEventListener('loadingdone', clearTextMeasurementCache);
    isWatchingFontLoads = true;
  }

  if (!canvas || !context) {
    canvas = document.createElement('canvas');
    context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas context');
    }
  }
  return context;
}

export function clearTextMeasurementCache(): void {
  measurementCache.clear();
}

/**
 * Measure text width using Canvas API
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: FontFamily = "Helvetica",
  bold: boolean = false,
  italic: boolean = false
): number {
  const ctx = getContext();
  const fontWeight = bold ? 'bold' : 'normal';
  const fontStyle = italic ? 'italic' : 'normal';
  const font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamilyMap[fontFamily]}`;
  const cacheKey = `${font}\u0000${text}`;
  const cachedWidth = measurementCache.get(cacheKey);
  if (cachedWidth !== undefined) {
    measurementCache.delete(cacheKey);
    measurementCache.set(cacheKey, cachedWidth);
    return cachedWidth;
  }

  ctx.font = font;
  const width = ctx.measureText(text).width;
  measurementCache.set(cacheKey, width);
  if (measurementCache.size > MAX_MEASUREMENT_CACHE_ENTRIES) {
    const oldestKey = measurementCache.keys().next().value;
    if (oldestKey !== undefined) measurementCache.delete(oldestKey);
  }
  return width;
}

/**
 * Calculate font size to fit text within a given width (shrink-to-fit)
 */
export function calculateShrinkToFitFontSize(
  text: string,
  maxWidth: number,
  baseFontSize: number,
  minFontSize: number = 8,
  fontFamily: FontFamily = "Helvetica",
  bold: boolean = false,
  italic: boolean = false
): number {
  let fontSize = baseFontSize;
  let textWidth = measureTextWidth(text, fontSize, fontFamily, bold, italic);
  
  // If text already fits, return original size
  if (textWidth <= maxWidth) {
    return fontSize;
  }
  
  // Binary search for optimal font size
  let low = minFontSize;
  let high = baseFontSize;
  
  while (high - low > 0.5) {
    fontSize = (low + high) / 2;
    textWidth = measureTextWidth(text, fontSize, fontFamily, bold, italic);
    
    if (textWidth > maxWidth) {
      high = fontSize;
    } else {
      low = fontSize;
    }
  }
  
  // Ensure we don't exceed maxWidth
  while (textWidth > maxWidth && fontSize > minFontSize) {
    fontSize -= 0.5;
    textWidth = measureTextWidth(text, fontSize, fontFamily, bold, italic);
  }
  
  return Math.max(fontSize, minFontSize);
}

/**
 * Split text into lines for multi-line display
 */
export function splitTextIntoLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number = 2,
  fontFamily: FontFamily = "Helvetica",
  bold: boolean = false,
  italic: boolean = false
): string[] {
  // Early return for empty text
  if (!text || maxLines <= 0) return [];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (let i = 0; i < words.length; i++) {
    // Absolute guarantee: never exceed maxLines
    if (lines.length >= maxLines) {
      break;
    }
    
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = measureTextWidth(testLine, fontSize, fontFamily, bold, italic);
    
    if (lineWidth > maxWidth && currentLine) {
      // Push current line
      lines.push(currentLine);
      
      // Check if we're at the limit after pushing
      if (lines.length >= maxLines) {
        // We've hit the limit, add ellipsis if there's more content
        const remainingContent = words.slice(i).join(' ');
        if (i < words.length) {
          const lastLine = lines[lines.length - 1];
          let truncatedLine = lastLine;
          while (measureTextWidth(truncatedLine + '...', fontSize, fontFamily, bold, italic) > maxWidth && truncatedLine.length > 0) {
            truncatedLine = truncatedLine.slice(0, -1).trim();
          }
          if (truncatedLine) {
            lines[lines.length - 1] = truncatedLine + '...';
          }
        }
        break;
      }
      
      // Start new line with current word
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  // Add any remaining text, but ONLY if we haven't hit the limit
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  
  // Final safety: slice to maxLines (this should never be needed, but just in case)
  return lines.slice(0, maxLines);
}

/**
 * Get line height for a given font size
 */
export function getLineHeight(fontSize: number, lineHeightMultiplier: number = 1.2): number {
  return fontSize * lineHeightMultiplier;
}
