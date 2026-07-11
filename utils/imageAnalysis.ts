// Lightweight image analysis utilities

import type { Positions } from '@/types/certificate';

const DEFAULT_TEXT_COLORS = new Set(['', '#000000', '#ffffff']);

/**
 * Apply a background-derived colour without overwriting user-selected colours.
 * Once any current field has a manual colour, automatic adjustment is disabled
 * for the current field set. Stale positions from removed fields are ignored.
 * Returns the original object when no field needs to change so callers can
 * safely use this in a React state updater without triggering another render.
 */
export function applyAutomaticTextColor(
  positions: Positions,
  columns: string[],
  autoColor: '#ffffff' | '#000000'
): Positions {
  const hasManualOrCustomColors = columns.some((key) => {
    const position = positions[key];
    if (!position) return false;

    const color = (position.color || '').toLowerCase();
    return position.isColorAutomatic !== true || !DEFAULT_TEXT_COLORS.has(color);
  });

  if (hasManualOrCustomColors) return positions;

  let nextPositions: Positions | null = null;

  for (const key of columns) {
    const current = positions[key];
    if (!current) continue;

    const currentColor = (current.color || '').toLowerCase();
    if (!DEFAULT_TEXT_COLORS.has(currentColor) || currentColor === autoColor) {
      continue;
    }

    if (!nextPositions) nextPositions = { ...positions };
    nextPositions[key] = {
      ...current,
      color: autoColor,
      isColorAutomatic: true
    };
  }

  return nextPositions || positions;
}

/**
 * Add colour provenance to projects saved before the flag existed. This
 * mirrors the legacy policy: black/white fields remain automatic only when
 * none of the current fields has a custom or explicitly manual colour.
 */
export function normalizeAutomaticTextColorProvenance(
  positions: Positions,
  columns: string[]
): Positions {
  const currentColumns = columns.length > 0 ? columns : Object.keys(positions);
  const currentColumnSet = new Set(currentColumns);
  const legacyColumns = Object.keys(positions).filter(
    (key) => positions[key] && positions[key].isColorAutomatic === undefined
  );

  if (legacyColumns.length === 0) return positions;

  const legacyColorsWereAutomatic = currentColumns.every((key) => {
    const position = positions[key];
    if (!position) return true;

    const color = (position.color || '').toLowerCase();
    return position.isColorAutomatic !== false && DEFAULT_TEXT_COLORS.has(color);
  });

  const nextPositions = { ...positions };
  for (const key of legacyColumns) {
    const color = (positions[key].color || '').toLowerCase();
    nextPositions[key] = {
      ...positions[key],
      isColorAutomatic: currentColumnSet.has(key)
        ? legacyColorsWereAutomatic
        : DEFAULT_TEXT_COLORS.has(color)
    };
  }

  return nextPositions;
}

/**
 * Average Rec. 709 luminance after compositing transparent pixels over white,
 * matching how certificate images appear on the page.
 */
export function calculateAverageLuminance(
  pixels: Uint8ClampedArray
): number | null {
  const totalPixels = Math.floor(pixels.length / 4);
  if (totalPixels === 0) return null;

  let sum = 0;

  for (let i = 0; i < totalPixels * 4; i += 4) {
    const alpha = pixels[i + 3] / 255;
    const pixelLuminance =
      0.2126 * pixels[i] +
      0.7152 * pixels[i + 1] +
      0.0722 * pixels[i + 2];
    sum += alpha * pixelLuminance + (1 - alpha) * 255;
  }

  return sum / totalPixels;
}

/**
 * Compute the average luminance of an image by drawing it to a small
 * offscreen canvas and averaging pixel values. Returns null when the image
 * cannot be analysed (for example, when a remote host blocks CORS access).
 */
export async function getImageAverageLuminance(
  imageUrl: string
): Promise<number | null> {
  if (!imageUrl) return null;

  // Wrap in a Promise to resolve after image load/draw
  return new Promise((resolve) => {
    try {
      const img = new Image();
      // Same-origin or blob URLs should work; keep anonymous to avoid tainting
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const targetSize = 32; // small sample for speed
          const w = Math.max(1, Math.min(targetSize, img.width));
          const h = Math.max(1, Math.min(targetSize, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          // Draw scaled image to canvas
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          resolve(calculateAverageLuminance(data));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Given a luminance in [0, 255], return a readable text color.
 * Dark backgrounds (< 128) -> white text, else black text.
 */
export function getReadableTextColorForLuminance(luminance: number): '#ffffff' | '#000000' {
  return luminance < 128 ? '#ffffff' : '#000000';
}
