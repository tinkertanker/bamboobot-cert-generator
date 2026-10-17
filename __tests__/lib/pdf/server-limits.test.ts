import {
  clampProgressiveBatchSize,
  MAX_PDF_FIELD_TEXT_LENGTH,
  MAX_PDF_FIELDS,
  MAX_PROGRESSIVE_BATCH_SIZE,
  validatePdfJobInput,
} from '@/lib/pdf/server-limits';

const positions = { name: { x: 0.5, y: 0.5, fontSize: 24 } };

describe('validatePdfJobInput', () => {
  it('accepts a normal job', () => {
    expect(validatePdfJobInput([{ name: { text: 'Ada' } }], positions, 10)).toBeNull();
  });

  it('rejects too many rows', () => {
    const rows = Array.from({ length: 11 }, () => ({ name: { text: 'x' } }));
    expect(validatePdfJobInput(rows, positions, 10)).toMatch(/At most 10 rows/);
  });

  it('rejects empty data, non-object rows and missing positions', () => {
    expect(validatePdfJobInput([], positions, 10)).not.toBeNull();
    expect(validatePdfJobInput([null], positions, 10)).not.toBeNull();
    expect(validatePdfJobInput([{}], null, 10)).not.toBeNull();
    expect(validatePdfJobInput([{}], { name: 'x' }, 10)).not.toBeNull();
  });

  it('rejects too many fields', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_PDF_FIELDS + 1 }, (_, i) => [`f${i}`, { x: 0, y: 0 }]));
    expect(validatePdfJobInput([{}], many, 10)).toMatch(/text fields/);
  });

  it('rejects oversized field text that would make layout quadratic', () => {
    const text = 'a'.repeat(MAX_PDF_FIELD_TEXT_LENGTH + 1);
    expect(validatePdfJobInput([{ name: { text } }], positions, 10)).toMatch(/characters/);
  });
});

describe('clampProgressiveBatchSize', () => {
  it('clamps to a sane range', () => {
    expect(clampProgressiveBatchSize(undefined)).toBe(20);
    expect(clampProgressiveBatchSize(1e9)).toBe(MAX_PROGRESSIVE_BATCH_SIZE);
    expect(clampProgressiveBatchSize(-5)).toBe(1);
    expect(clampProgressiveBatchSize('abc')).toBe(20);
  });
});
