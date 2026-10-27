/**
 * localStorage is shared by every account that signs in on the same browser.
 * Projects, the working session, email queues and onboarding flags are stored
 * unscoped, so without a guard a second account would see the first account's
 * data. This module records which account owns the current localStorage
 * contents and purges everything when a *different* account signs in.
 *
 * Unknown-owner data is preserved in an opaque quarantine, never adopted by
 * whoever signs in next. Recovery requires a separate ownership decision.
 * Storage failures propagate so the editor cannot mount and disclose originals.
 */

const OWNER_KEY = 'bamboobot_ls_owner_v1';
export const QUARANTINE_PREFIX = 'bamboobot_quarantine_';

// Prefixes / exact keys of all app-owned localStorage entries.
const APP_KEY_PREFIXES = [
  'bamboobot_project_v1_',
  'bamboobot_template_v1_', // legacy projects
  'email-queue-',
  'pdf-queue-', // client PDF queue state (holds recipient row data)
];
const APP_EXACT_KEYS = [
  'bamboobot_current_session_v1',
  'bamboobot_onboarding_completed',
  'bamboobot_tour_completed',
  'bamboobot_project_import_declined',
];

function isAppOwnedKey(key: string): boolean {
  if (key === OWNER_KEY) return false;
  if (APP_EXACT_KEYS.includes(key)) return true;
  return APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function appOwnedKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isAppOwnedKey(key)) keys.push(key);
  }
  return keys;
}

/**
 * Ensure the browser's localStorage belongs to the given account, clearing it
 * when the owning account changes. Returns true when a purge was performed.
 *
 * Pass the authenticated user id. Pass null/undefined when there is no session
 * yet — in that case nothing is touched (the guard runs once the user is known).
 */
export function guardLocalStorageForUser(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !userId) return false;

  const previousOwner = localStorage.getItem(OWNER_KEY);
  if (previousOwner === userId) return false;

  const keys = appOwnedKeys();
  if (previousOwner === null && keys.length) {
    const archive = JSON.stringify(Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])));
    const archiveKey = `${QUARANTINE_PREFIX}${crypto.randomUUID()}`;
    localStorage.setItem(archiveKey, archive);
    if (localStorage.getItem(archiveKey) !== archive) throw new Error('Browser data quarantine failed');
  }
  for (const key of keys) localStorage.removeItem(key);
  if (appOwnedKeys().length) throw new Error('Browser data isolation failed');
  localStorage.setItem(OWNER_KEY, userId);
  if (localStorage.getItem(OWNER_KEY) !== userId) throw new Error('Browser ownership could not be recorded');
  return keys.length > 0;
}

export const __test__ = { OWNER_KEY, isAppOwnedKey };
