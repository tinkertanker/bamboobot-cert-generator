/**
 * Email utility functions
 * Centralised validation, parsing, and formatting for all email operations
 */

/**
 * Robust email validation with practical checks
 * - Basic structure with TLD requirement
 * - Rejects consecutive dots
 * - Enforces max length per RFC 5321
 */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  // Practical email validation: alphanumeric + common special chars, @ domain with TLD
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(trimmed) && !trimmed.includes('..');
}

/**
 * Normalise an email address (lowercase, trim)
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Check if a value contains valid email(s) - supports comma-separated
 */
export function isValidEmailValue(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;

  if (trimmed.includes(',')) {
    const emails = trimmed.split(',').map(e => e.trim()).filter(e => e.length > 0);
    return emails.length > 0 && emails.every(e => isValidEmail(e));
  }
  return isValidEmail(trimmed);
}

/**
 * Parse comma-separated emails into normalised array
 * Always returns string[] for consistent handling downstream
 * Invalid emails are filtered out
 */
export function parseRecipients(to: string): string[] {
  const trimmed = to.trim();
  if (trimmed.length === 0) return [];

  const emails = trimmed
    .split(',')
    .map(e => normaliseEmail(e))
    .filter(e => e.length > 0 && isValidEmail(e));

  // Deduplicate
  return [...new Set(emails)];
}

/**
 * Format recipients array for display (logs, status, UI)
 */
export function formatRecipients(recipients: string[]): string {
  return recipients.join(', ');
}

/**
 * Attachment building types
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
 * Returns null if no valid attachments could be built
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

  return result.length > 0 ? result : undefined;
}
