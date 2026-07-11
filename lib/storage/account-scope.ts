/**
 * localStorage is shared by every account that signs in on the same browser.
 * Projects, the working session, email queues and onboarding flags are stored
 * unscoped, so without a guard a second account would see the first account's
 * data. This module records which account owns the current localStorage
 * contents and purges everything when a *different* account signs in.
 *
 * On first run for a given browser the owner is unknown; we adopt the current
 * account without purging so a single user's existing work is never destroyed
 * by the upgrade. Purging only happens on an actual account change, and we do
 * not clear on sign-out (that would lose the owner's own projects between their
 * own sessions — the next different sign-in performs the purge instead).
 */

const OWNER_KEY = 'bamboobot_ls_owner_v1';

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
];

function isAppOwnedKey(key: string): boolean {
  if (key === OWNER_KEY) return false;
  if (APP_EXACT_KEYS.includes(key)) return true;
  return APP_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function purgeAppOwnedKeys(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isAppOwnedKey(key)) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
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

  let previousOwner: string | null = null;
  try {
    previousOwner = localStorage.getItem(OWNER_KEY);
  } catch {
    return false;
  }

  if (previousOwner === userId) return false;

  try {
    // Unknown owner: adopt the current account without discarding existing data.
    if (previousOwner !== null) {
      purgeAppOwnedKeys();
    }
    localStorage.setItem(OWNER_KEY, userId);
    return previousOwner !== null;
  } catch {
    return false;
  }
}

export const __test__ = { OWNER_KEY, isAppOwnedKey };
