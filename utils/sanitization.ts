/**
 * Utility functions for sanitizing user input
 */

/**
 * Escape HTML special characters to prevent XSS attacks and display issues
 * @param str - The string to escape
 * @returns The escaped string
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;'
  };
  
  return str.replace(/[&<>"'\/]/g, (match) => htmlEscapes[match]);
}

/**
 * Sanitize template names to prevent display issues
 * @param name - The template name to sanitize
 * @returns The sanitized name
 */
export function sanitizeTemplateName(name: string): string {
  // Remove control characters and trim whitespace
  const cleaned = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
  
  // If the name is empty after cleaning, return a default
  if (!cleaned) {
    return 'Untitled Project';
  }
  
  // Limit length to prevent UI issues
  const maxLength = 100;
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength - 3) + '...';
  }
  
  return cleaned;
}