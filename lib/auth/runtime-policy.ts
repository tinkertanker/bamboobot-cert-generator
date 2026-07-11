const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Returns whether application routes must require authentication.
 *
 * REQUIRE_AUTH is intentionally server-only and read for every request so a
 * single production build can be promoted between environments safely.
 */
export function isAuthenticationRequired(): boolean {
  const configuredValue = process.env['REQUIRE_AUTH'];

  if (configuredValue === undefined || configuredValue.trim() === '') {
    return process.env['NODE_ENV'] === 'production';
  }

  const normalizedValue = configuredValue.trim().toLowerCase();
  if (TRUE_VALUES.has(normalizedValue)) return true;
  if (FALSE_VALUES.has(normalizedValue)) return false;

  // Unknown security configuration must not silently disable authentication.
  return true;
}
