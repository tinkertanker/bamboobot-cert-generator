/**
 * Email utilities - Server-side module
 *
 * This module includes server-only helpers (uses Buffer) plus re-exports
 * the browser-safe validation functions for convenience.
 *
 * For client-side code, import directly from utils/email-validation.ts
 * to avoid bundling Buffer polyfills.
 */

import {
  assertPdfBuffer,
  getMaxPdfSourceBytes,
  loadTrustedPdf,
  PdfSourceError,
  sanitizePdfFilename,
} from '@/lib/security/trusted-pdf-source';

const DEFAULT_MAX_EMAIL_ATTACHMENTS = 10;

// Re-export browser-safe functions for server-side convenience
export {
  isValidEmail,
  normaliseEmail,
  isValidEmailValue,
  parseRecipients,
  parseRecipientsDetailed,
  formatRecipients,
  type ParseRecipientsResult
} from './email-validation';

/**
 * Attachment building types (server-only)
 */
export interface AttachmentDataInput {
  data?: number[] | Uint8Array;
  filename?: string;
}

export interface AttachmentPathInput {
  path?: string;
  filename?: string;
  content?: Buffer | string;
}

export interface BuildAttachmentsOptions {
  /** Client-side PDF as {data, filename} or raw base64/array */
  attachmentData?: AttachmentDataInput | string | number[];
  /** Server-side attachment with path */
  attachment?: AttachmentPathInput;
  /** Array of server-side attachments with paths */
  attachments?: AttachmentPathInput[];
  /** Direct URL for server-side PDF */
  attachmentUrl?: string;
  /** Default filename if not provided elsewhere */
  defaultFilename?: string;
  /** Maximum combined attachment bytes for this email */
  maxTotalBytes?: number;
  /** Maximum number of attachments for this email */
  maxAttachments?: number;
}

export interface BuiltAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Fetch a PDF from URL and return as Buffer
 */
async function fetchPdfBuffer(url: string, maxBytes: number): Promise<Buffer> {
  try {
    const { buffer } = await loadTrustedPdf(url, maxBytes);
    return buffer;
  } catch (error) {
    if (error instanceof PdfSourceError) {
      console.warn(`Rejected or unavailable PDF attachment source (${error.code})`);
      throw error;
    }
    console.error('Error loading PDF attachment:', error);
    throw new PdfSourceError('FETCH_FAILED', 'Unable to load PDF attachment', 502);
  }
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function validateInlinePdf(buffer: Buffer, remainingBytes: number): void {
  if (buffer.length > remainingBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachments exceed the size limit', 413);
  }
  assertPdfBuffer(buffer);
}

function decodeBase64Pdf(value: string, maxBytes: number): Buffer {
  // Base64 expands binary data by roughly 4/3. Reject from the encoded length
  // before allocating the decoded Buffer, then enforce the exact byte count.
  const maxEncodedLength = Math.ceil(maxBytes / 3) * 4 + 4;
  if (value.length > maxEncodedLength) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachment exceeds the size limit', 413);
  }

  const buffer = Buffer.from(value, 'base64');
  if (buffer.length > maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachment exceeds the size limit', 413);
  }
  return buffer;
}

function bufferFromPdfBytes(value: unknown, maxBytes: number): Buffer {
  if (!Array.isArray(value) && !(value instanceof Uint8Array)) {
    throw new PdfSourceError('INVALID_PDF', 'Invalid PDF attachment byte data', 400);
  }
  if (value.length > maxBytes) {
    throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachment exceeds the size limit', 413);
  }
  if (Array.isArray(value) && value.some((byte) =>
    !Number.isInteger(byte) || byte < 0 || byte > 255
  )) {
    throw new PdfSourceError('INVALID_PDF', 'Invalid PDF attachment byte data', 400);
  }
  return Buffer.from(value);
}

/**
 * Build PDF attachments from various input formats
 *
 * Handles:
 * - Client-side PDF data as {data: number[], filename}
 * - Client-side PDF data as base64 string
 * - Client-side PDF data as number[] (Uint8Array)
 * - Server-side attachment with path (fetches content)
 * - Array of server-side attachments
 * - Direct attachment URL
 *
 * Returns undefined if no valid attachments could be built
 */
export async function buildPdfAttachments(
  options: BuildAttachmentsOptions
): Promise<BuiltAttachment[] | undefined> {
  const {
    attachmentData,
    attachment,
    attachments,
    attachmentUrl,
    defaultFilename = 'certificate.pdf',
  } = options;
  const configuredMaxBytes = getMaxPdfSourceBytes();
  const maxTotalBytes = Math.min(
    positiveLimit(options.maxTotalBytes, configuredMaxBytes),
    configuredMaxBytes
  );
  const maxAttachments = positiveLimit(options.maxAttachments, DEFAULT_MAX_EMAIL_ATTACHMENTS);
  const result: BuiltAttachment[] = [];

  const appendAttachment = (buffer: Buffer, filename: string) => {
    const usedBytes = result.reduce((total, item) => total + item.content.length, 0);
    validateInlinePdf(buffer, maxTotalBytes - usedBytes);
    result.push({
      filename: sanitizePdfFilename(filename, defaultFilename),
      content: buffer,
      contentType: 'application/pdf'
    });
  };

  // Handle client-side PDF data (various formats)
  if (attachmentData) {
    let buffer: Buffer | null = null;
    let filename = defaultFilename;

    if (typeof attachmentData === 'string') {
      // Base64 string
      buffer = decodeBase64Pdf(attachmentData, maxTotalBytes);
    } else if (Array.isArray(attachmentData)) {
      // Raw number array (Uint8Array serialised)
      buffer = bufferFromPdfBytes(attachmentData, maxTotalBytes);
    } else if (attachmentData.data) {
      // Object with data property
      buffer = bufferFromPdfBytes(attachmentData.data, maxTotalBytes);
      if (attachmentData.filename) {
        filename = attachmentData.filename;
      }
    }

    if (buffer) {
      appendAttachment(buffer, filename);
      return result;
    }
  }

  // Handle single server-side attachment with path
  if (attachment?.path) {
    const buffer = await fetchPdfBuffer(attachment.path, maxTotalBytes);
    appendAttachment(buffer, attachment.filename || defaultFilename);
    return result;
  }

  // Handle array of server-side attachments
  if (attachments && attachments.length > 0) {
    if (attachments.length > maxAttachments) {
      throw new PdfSourceError('PDF_TOO_LARGE', 'Too many PDF attachments', 413);
    }

    for (const att of attachments) {
      const usedBytes = result.reduce((total, item) => total + item.content.length, 0);
      const remainingBytes = maxTotalBytes - usedBytes;

      if (att.path) {
        const buffer = await fetchPdfBuffer(att.path, remainingBytes);
        appendAttachment(buffer, att.filename || defaultFilename);
      } else if (att.content) {
        const buffer = typeof att.content === 'string'
          ? decodeBase64Pdf(att.content, remainingBytes)
          : bufferFromPdfBytes(att.content as Buffer, remainingBytes);
        appendAttachment(buffer, att.filename || defaultFilename);
      }
    }

    if (result.length > 0) {
      return result;
    }
  }

  // Handle direct attachment URL
  if (attachmentUrl) {
    const buffer = await fetchPdfBuffer(attachmentUrl, maxTotalBytes);
    appendAttachment(buffer, defaultFilename);
    return result;
  }

  return undefined;
}
