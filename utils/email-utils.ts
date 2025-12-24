/**
 * Email utility functions
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check if a single email address is valid
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Check if a value contains valid email(s) - supports comma-separated
 */
export function isValidEmailValue(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.includes(',')) {
    return trimmed.split(',').every(e => isValidEmail(e));
  }
  return isValidEmail(trimmed);
}

/**
 * Parse comma-separated emails into array, or return single email
 */
export function parseRecipients(to: string): string | string[] {
  if (!to.includes(',')) return to.trim();
  const emails = to.split(',').map(e => e.trim()).filter(e => e.length > 0);
  return emails.length === 1 ? emails[0] : emails;
}
