/**
 * Browser-safe email validation and parsing utilities
 *
 * This module contains only pure JavaScript functions with no Node.js dependencies.
 * Import from here in client-side code to avoid bundling Buffer polyfills.
 *
 * For server-side code that needs attachment handling, use email-utils.ts instead.
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

export interface ParseRecipientsResult {
  valid: string[];
  rejected: string[];
}

/**
 * Parse comma-separated emails with detailed results
 * Returns both valid recipients and rejected tokens for warning/logging
 */
export function parseRecipientsDetailed(to: string): ParseRecipientsResult {
  const trimmed = to.trim();
  if (trimmed.length === 0) return { valid: [], rejected: [] };

  const tokens = trimmed.split(',').map(e => e.trim()).filter(e => e.length > 0);
  const valid: string[] = [];
  const rejected: string[] = [];

  for (const token of tokens) {
    const normalised = normaliseEmail(token);
    if (isValidEmail(normalised)) {
      valid.push(normalised);
    } else {
      rejected.push(token);
    }
  }

  // Deduplicate valid emails
  return { valid: [...new Set(valid)], rejected };
}

/**
 * Parse comma-separated emails into normalised array
 * Always returns string[] for consistent handling downstream
 * Invalid emails are filtered out silently (use parseRecipientsDetailed for warnings)
 */
export function parseRecipients(to: string): string[] {
  return parseRecipientsDetailed(to).valid;
}

/**
 * Format recipients array for display (logs, status, UI)
 */
export function formatRecipients(recipients: string[]): string {
  return recipients.join(', ');
}
