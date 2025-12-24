/**
 * Email utilities - Server-side module
 *
 * This module includes server-only helpers (uses Buffer) plus re-exports
 * the browser-safe validation functions for convenience.
 *
 * For client-side code, import directly from utils/email-validation.ts
 * to avoid bundling Buffer polyfills.
 */

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
}

export interface BuiltAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/**
 * Fetch a PDF from URL and return as Buffer
 */
async function fetchPdfBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch attachment from ${url}: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return null;
  }
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
  const { attachmentData, attachment, attachments, attachmentUrl, defaultFilename = 'certificate.pdf' } = options;
  const result: BuiltAttachment[] = [];

  // Handle client-side PDF data (various formats)
  if (attachmentData) {
    let buffer: Buffer | null = null;
    let filename = defaultFilename;

    if (typeof attachmentData === 'string') {
      // Base64 string
      buffer = Buffer.from(attachmentData, 'base64');
    } else if (Array.isArray(attachmentData)) {
      // Raw number array (Uint8Array serialised)
      buffer = Buffer.from(attachmentData);
    } else if (attachmentData.data) {
      // Object with data property
      buffer = Buffer.from(attachmentData.data);
      if (attachmentData.filename) {
        filename = attachmentData.filename;
      }
    }

    if (buffer) {
      result.push({
        filename,
        content: buffer,
        contentType: 'application/pdf'
      });
      return result;
    }
  }

  // Handle single server-side attachment with path
  if (attachment?.path) {
    const buffer = await fetchPdfBuffer(attachment.path);
    if (buffer) {
      result.push({
        filename: attachment.filename || defaultFilename,
        content: buffer,
        contentType: 'application/pdf'
      });
      return result;
    }
  }

  // Handle array of server-side attachments
  if (attachments && attachments.length > 0) {
    const fetched = await Promise.all(
      attachments.map(async (att) => {
        if (att.path) {
          const buffer = await fetchPdfBuffer(att.path);
          if (buffer) {
            return {
              filename: att.filename || defaultFilename,
              content: buffer,
              contentType: 'application/pdf'
            };
          }
        } else if (att.content) {
          // Already has content
          return {
            filename: att.filename || defaultFilename,
            content: typeof att.content === 'string'
              ? Buffer.from(att.content, 'base64')
              : att.content as Buffer,
            contentType: 'application/pdf'
          };
        }
        return null;
      })
    );

    const valid = fetched.filter((a): a is BuiltAttachment => a !== null);
    if (valid.length > 0) {
      return valid;
    }
  }

  // Handle direct attachment URL
  if (attachmentUrl) {
    const buffer = await fetchPdfBuffer(attachmentUrl);
    if (buffer) {
      result.push({
        filename: defaultFilename,
        content: buffer,
        contentType: 'application/pdf'
      });
      return result;
    }
  }

  return undefined;
}
