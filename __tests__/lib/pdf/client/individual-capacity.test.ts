import {
  assessIndividualPdfCapacity,
  estimateTemplateBytes
} from '@/lib/pdf/client/individual-capacity';

const MIB = 1024 * 1024;

describe('assessIndividualPdfCapacity', () => {
  it('uses converted PDF size and conservatively estimates pending images', () => {
    expect(estimateTemplateBytes(900, { size: 100, type: 'image/png' })).toBe(900);
    expect(estimateTemplateBytes(null, { size: 100, type: 'image/png' })).toBe(150);
    expect(
      estimateTemplateBytes(null, { size: 100, type: 'application/pdf' })
    ).toBe(100);
  });
  it('allows a small job within the available heap budget', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 10,
      templateBytes: 200 * 1024,
      visibleFieldCount: 3,
      customFontCount: 0,
      memory: {
        available: true,
        jsHeapSizeLimit: 1024 * MIB,
        usedJSHeapSize: 128 * MIB
      }
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.estimatedPeakBytes).toBeLessThanOrEqual(result.budgetBytes);
  });

  it('rejects jobs above the hard client row limit', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 501,
      templateBytes: 100 * 1024,
      visibleFieldCount: 1,
      customFontCount: 0,
      memory: { available: true, deviceMemory: 16 }
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('row-limit');
  });

  it('fails conservatively when memory information is unavailable', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 101,
      templateBytes: 50 * 1024,
      visibleFieldCount: 1,
      customFontCount: 0,
      memory: { available: false }
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unknown-memory');
    expect(result.budgetBytes).toBe(128 * MIB);
  });

  it('rejects a job whose peak estimate exceeds the heap budget', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 100,
      templateBytes: 2 * MIB,
      visibleFieldCount: 10,
      customFontCount: 2,
      memory: {
        available: true,
        jsHeapSizeLimit: 512 * MIB,
        usedJSHeapSize: 384 * MIB
      }
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('memory-limit');
    expect(result.estimatedPeakBytes).toBeGreaterThan(result.budgetBytes);
  });

  it('caps device-memory budgets at 1 GiB', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 1,
      templateBytes: 10 * 1024,
      visibleFieldCount: 1,
      customFontCount: 0,
      memory: { available: true, deviceMemory: 32 }
    });

    expect(result.budgetBytes).toBe(1024 * MIB);
  });

  it('does not charge streamed Blob retention against the JS heap', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 500,
      templateBytes: 500 * 1024,
      visibleFieldCount: 3,
      customFontCount: 0,
      memory: {
        available: true,
        jsHeapSizeLimit: 4 * 1024 * MIB,
        usedJSHeapSize: 150 * MIB
      }
    });

    expect(result.estimatedRetainedBytes).toBeGreaterThan(result.estimatedPeakBytes);
    expect(result.allowed).toBe(true);
  });

  it('rejects multi-gigabyte retained output independently of heap usage', () => {
    const result = assessIndividualPdfCapacity({
      rowCount: 500,
      templateBytes: 10 * MIB,
      visibleFieldCount: 3,
      customFontCount: 0,
      memory: {
        available: true,
        jsHeapSizeLimit: 4 * 1024 * MIB,
        usedJSHeapSize: 150 * MIB
      }
    });

    expect(result.estimatedPeakBytes).toBeLessThan(result.budgetBytes);
    expect(result.estimatedRetainedBytes).toBeGreaterThan(
      result.retainedBudgetBytes
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('memory-limit');
  });

  it('uses a conservative template estimate when size is unknown', () => {
    const known = assessIndividualPdfCapacity({
      rowCount: 5,
      templateBytes: 100 * 1024,
      visibleFieldCount: 1,
      customFontCount: 0,
      memory: { available: true, deviceMemory: 8 }
    });
    const unknown = assessIndividualPdfCapacity({
      rowCount: 5,
      templateBytes: null,
      visibleFieldCount: 1,
      customFontCount: 0,
      memory: { available: true, deviceMemory: 8 }
    });

    expect(unknown.estimatedPeakBytes).toBeGreaterThan(known.estimatedPeakBytes);
  });
});
