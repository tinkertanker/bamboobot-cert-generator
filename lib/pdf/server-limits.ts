/**
 * Input bounds for the legacy server-side PDF endpoints. A 1MB JSON body can
 * otherwise describe hundreds of thousands of rows (each one a full copy of the
 * template held in memory) or a single field long enough to make text layout
 * quadratic, letting one authenticated request exhaust the server.
 */
export const MAX_SINGLE_REQUEST_PDF_ROWS = 1000;
export const MAX_PROGRESSIVE_PDF_ROWS = 5000;
export const MAX_PDF_FIELDS = 100;
export const MAX_PDF_FIELD_TEXT_LENGTH = 2000;
export const MAX_PROGRESSIVE_BATCH_SIZE = 50;
export const MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a user-facing error message when the job exceeds server bounds, or
 * null when it is acceptable.
 */
export function validatePdfJobInput(data: unknown, positions: unknown, maxRows: number): string | null {
  if (!Array.isArray(data) || data.length === 0) {
    return 'Data array is required and must not be empty';
  }
  if (data.length > maxRows) {
    return `At most ${maxRows} rows can be generated in one request`;
  }
  if (!isPlainObject(positions)) {
    return 'Positions object is required';
  }
  const positionKeys = Object.keys(positions);
  if (positionKeys.length > MAX_PDF_FIELDS) {
    return `At most ${MAX_PDF_FIELDS} text fields are supported`;
  }
  if (positionKeys.some(key => !isPlainObject(positions[key]))) {
    return 'Invalid text field position';
  }
  for (const entry of data) {
    if (!isPlainObject(entry)) return 'Each data row must be an object';
    for (const key of positionKeys) {
      const value = entry[key];
      if (value === undefined || value === null) continue;
      const text = isPlainObject(value) ? value.text : value;
      if (typeof text === 'string' && text.length > MAX_PDF_FIELD_TEXT_LENGTH) {
        return `Field values are limited to ${MAX_PDF_FIELD_TEXT_LENGTH} characters`;
      }
    }
  }
  return null;
}

export function clampProgressiveBatchSize(value: unknown, fallback = 20): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_PROGRESSIVE_BATCH_SIZE);
}
