export const MAX_RECIPIENTS_PER_MESSAGE = 10;
export const MAX_BULK_RECIPIENTS = 500;
export const MAX_EMAIL_SUBJECT_LENGTH = 200;
export const MAX_EMAIL_SENDER_NAME_LENGTH = 100;
export const MAX_EMAIL_MESSAGE_LENGTH = 10_000;

export class EmailRequestError extends Error {
  constructor(message: string, public readonly statusCode: number = 400) {
    super(message);
    this.name = 'EmailRequestError';
  }
}

export function requireBoundedEmailText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') throw new EmailRequestError(`${field} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw new EmailRequestError(`${field} is required`);
  if (trimmed.length > maxLength) {
    throw new EmailRequestError(`${field} is too long`, 413);
  }
  return trimmed;
}

export function assertRecipientCount(count: number, maximum: number): void {
  if (count > maximum) {
    throw new EmailRequestError(`Too many email recipients; maximum is ${maximum}`, 413);
  }
}

export function requireSafeEmailHeader(value: string, field: string): string {
  // The provider receives `senderName <address>` as a mailbox header. Reject
  // RFC 5322 address-list and quoted-string delimiters so the display name
  // cannot be reinterpreted as another mailbox or header structure.
  if (/[\r\n\0]/.test(value) || (field === 'senderName' && /[<>,;:@"\\]/.test(value))) {
    throw new EmailRequestError(`${field} contains invalid characters`);
  }
  return value;
}
