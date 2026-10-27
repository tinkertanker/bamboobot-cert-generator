/** Shared bounds for Canvas and PDF measurement. Invalid layouts fail before measuring. */
export function assertTextFitBounds(maxWidth: number, baseSize: number, minSize: number): void {
  if (!Number.isFinite(maxWidth) || maxWidth < 0 ||
      !Number.isFinite(baseSize) || baseSize <= 0 || baseSize > 1_000_000 ||
      !Number.isFinite(minSize) || minSize <= 0 || minSize > 1_000_000) {
    throw new Error('Invalid text layout dimensions');
  }
}

/** Find a fitting prefix without remeasuring every successively shorter string. */
export function ellipsise(text: string, maxWidth: number, measure: (text: string) => number): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    if (measure(text.slice(0, mid).trimEnd() + '...') <= maxWidth) low = mid;
    else high = mid - 1;
  }
  const prefix = text.slice(0, low).trimEnd();
  return prefix ? prefix + '...' : text;
}
