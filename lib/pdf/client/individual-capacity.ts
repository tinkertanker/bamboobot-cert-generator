import type { MemoryInfo } from './feature-detection';

const MIB = 1024 * 1024;
const DEFAULT_TEMPLATE_BYTES = 2 * MIB;
const UNKNOWN_MEMORY_BUDGET = 128 * MIB;
const MAX_DEVICE_MEMORY_BUDGET = 1024 * MIB;
const MAX_RETAINED_OUTPUT_BYTES = 1024 * MIB;
const MAX_CLIENT_ROWS = 500;
const MAX_UNKNOWN_MEMORY_ROWS = 100;

export type CapacityReason =
  | 'ok'
  | 'row-limit'
  | 'memory-limit'
  | 'unknown-memory';

export interface IndividualCapacityInput {
  rowCount: number;
  templateBytes?: number | null;
  visibleFieldCount: number;
  customFontCount: number;
  memory: MemoryInfo;
}

export interface CapacityDecision {
  allowed: boolean;
  estimatedRetainedBytes: number;
  estimatedPeakBytes: number;
  budgetBytes: number;
  retainedBudgetBytes: number;
  reason: CapacityReason;
}

export function estimateTemplateBytes(
  localPdfBytes: number | null | undefined,
  source?: { size: number; type: string } | null
): number | null {
  if (
    typeof localPdfBytes === 'number' &&
    Number.isFinite(localPdfBytes) &&
    localPdfBytes > 0
  ) {
    return localPdfBytes;
  }
  if (!source) return null;
  return source.type === 'application/pdf'
    ? source.size
    : Math.ceil(source.size * 1.5);
}

export function assessIndividualPdfCapacity({
  rowCount,
  templateBytes,
  visibleFieldCount,
  customFontCount,
  memory
}: IndividualCapacityInput): CapacityDecision {
  const normalizedRows = Math.max(0, rowCount);
  const normalizedTemplateBytes =
    typeof templateBytes === 'number' &&
    Number.isFinite(templateBytes) &&
    templateBytes > 0
      ? templateBytes
      : DEFAULT_TEMPLATE_BYTES;
  const fontBytes = Math.min(Math.max(0, customFontCount) * MIB, 3 * MIB);
  const fieldBytes = Math.max(0, visibleFieldCount) * 4 * 1024;
  const estimatedPerFileBytes =
    Math.ceil(normalizedTemplateBytes * 1.2) + fontBytes + fieldBytes + 128 * 1024;
  const estimatedRetainedBytes = normalizedRows * estimatedPerFileBytes;
  const preparedPayloadBytes = normalizedRows * Math.max(1, visibleFieldCount) * 512;
  // Streamed Blob output is backed by browser Blob storage, not the JS heap.
  // Only charge the gate for the worker's active document and request payload;
  // ZIP creation has its own, user-triggered memory cost.
  const generationPeakBytes =
    estimatedPerFileBytes * 3 +
    normalizedTemplateBytes * 2 +
    preparedPayloadBytes +
    32 * MIB;
  const estimatedPeakBytes = generationPeakBytes;

  let budgetBytes = UNKNOWN_MEMORY_BUDGET;
  let retainedBudgetBytes = UNKNOWN_MEMORY_BUDGET;
  let hasReliableMemory = false;

  if (memory.jsHeapSizeLimit) {
    const availableHeap = Math.max(
      0,
      memory.jsHeapSizeLimit - (memory.usedJSHeapSize || 0)
    );
    budgetBytes = Math.floor(availableHeap * 0.25);
    retainedBudgetBytes = Math.min(
      Math.floor(memory.jsHeapSizeLimit * 0.25),
      MAX_RETAINED_OUTPUT_BYTES
    );
    hasReliableMemory = true;
  } else if (memory.deviceMemory) {
    budgetBytes = Math.min(
      Math.floor(memory.deviceMemory * 64 * MIB),
      MAX_DEVICE_MEMORY_BUDGET
    );
    retainedBudgetBytes = Math.min(
      Math.floor(memory.deviceMemory * 128 * MIB),
      MAX_RETAINED_OUTPUT_BYTES
    );
    hasReliableMemory = true;
  }

  if (normalizedRows > MAX_CLIENT_ROWS) {
    return {
      allowed: false,
      estimatedRetainedBytes,
      estimatedPeakBytes,
      budgetBytes,
      retainedBudgetBytes,
      reason: 'row-limit'
    };
  }

  if (!hasReliableMemory && normalizedRows > MAX_UNKNOWN_MEMORY_ROWS) {
    return {
      allowed: false,
      estimatedRetainedBytes,
      estimatedPeakBytes,
      budgetBytes,
      retainedBudgetBytes,
      reason: 'unknown-memory'
    };
  }

  const allowed =
    estimatedPeakBytes <= budgetBytes &&
    estimatedRetainedBytes <= retainedBudgetBytes;
  return {
    allowed,
    estimatedRetainedBytes,
    estimatedPeakBytes,
    budgetBytes,
    retainedBudgetBytes,
    reason: allowed ? 'ok' : hasReliableMemory ? 'memory-limit' : 'unknown-memory'
  };
}
