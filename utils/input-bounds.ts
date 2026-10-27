// Bounds apply before rectangular expansion, preview measurement or PDF layout.
export const MAX_TABLE_CELLS = 100_000;
export const MAX_TABLE_TEXT = 1_000_000;
export const TABLE_LIMIT_ERROR = 'Table exceeds 5,000 rows, 100 columns, 100,000 cells or 1,000,000 characters';

export function tableSizeError(rows: number, columns: number, textLength = 0): string | null {
  return rows > 5000 || columns > 100 || rows * columns > MAX_TABLE_CELLS || textLength > MAX_TABLE_TEXT
    ? TABLE_LIMIT_ERROR : null;
}

export function layoutError(positions: unknown): string | null {
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) return 'Invalid text field positions';
  const entries = Object.values(positions);
  if (entries.length > 100) return 'At most 100 text fields are supported';
  const ranges: Record<string, [number, number]> = {
    x: [-10000, 10000], y: [-10000, 10000], fontSize: [0.1, 1000], width: [0.1, 100], lineHeight: [0.1, 10],
  };
  for (const position of entries) {
    if (!position || typeof position !== 'object' || Array.isArray(position)) return 'Invalid text field position';
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = position[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) {
        return `Invalid text field ${key}`;
      }
    }
  }
  return null;
}

export function projectInputError(positions: unknown, columns: unknown, rows: unknown): string | null {
  const error = layoutError(positions);
  if (error) return error;
  if (!Array.isArray(columns) || !columns.every(column => typeof column === 'string') || !Array.isArray(rows)) {
    return 'Invalid project table';
  }
  const sizeError = tableSizeError(rows.length, columns.length);
  if (sizeError) return sizeError;
  // Include separators and repeated column names before allocating row strings.
  let length = columns.join('\t').length + rows.length * columns.length;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return 'Invalid project row';
    for (const column of columns) {
      const value = row[column];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > 2000) return 'Field values are limited to 2000 characters';
      length += value.length;
      if (length > MAX_TABLE_TEXT) return TABLE_LIMIT_ERROR;
    }
  }
  return tableSizeError(rows.length, columns.length, length);
}
