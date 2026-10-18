import { EmailRequestError } from './abuse-controls';

/**
 * Limits for bulk email queues. Queues are held per user in a Durable Object,
 * so every cap here is per account. Each can be lowered with an environment
 * variable but never raised above its hard maximum.
 */
export const MAX_BULK_EMAILS = 500;
export const ACTIVE_QUEUE_TTL_MS = 60 * 60 * 1000;
export const PAUSED_QUEUE_TTL_MS = 24 * ACTIVE_QUEUE_TTL_MS;
export const TERMINAL_STATUS_TTL_MS = 10 * 60 * 1000;
export const INGESTION_LEASE_MS = 5 * 60 * 1000;
const MAX_SESSION_ID_LENGTH = 128;
const HARD_MAX_BULK_ATTACHMENT_BYTES = 250 * 1024 * 1024;

function boundedPositiveInteger(name: string, fallback: number, hardMaximum: number): number {
  const configured = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return fallback;
  return Math.min(configured, hardMaximum);
}

export function requireSessionId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SESSION_ID_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new EmailRequestError('Invalid session ID');
  }
  return value;
}

export function getMaxActiveQueuesPerUser(): number {
  return boundedPositiveInteger('MAX_ACTIVE_EMAIL_QUEUES_PER_USER', 5, 20);
}

export function getMaxConcurrentIngestionsPerUser(): number {
  return boundedPositiveInteger('MAX_CONCURRENT_EMAIL_INGESTIONS_PER_USER', 2, 10);
}

export function getMaxPausedQueuesPerUser(): number {
  return boundedPositiveInteger('MAX_PAUSED_EMAIL_QUEUES_PER_USER', 2, 10);
}

export function getMaxRetainedAttachmentBytesPerUser(): number {
  return boundedPositiveInteger('MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER', 250 * 1024 * 1024, 512 * 1024 * 1024);
}

/** Attachment bytes a single bulk request may add. */
export function getMaxBulkAttachmentBytes(): number {
  return boundedPositiveInteger('MAX_BULK_EMAIL_ATTACHMENT_BYTES', 100 * 1024 * 1024, HARD_MAX_BULK_ATTACHMENT_BYTES);
}
