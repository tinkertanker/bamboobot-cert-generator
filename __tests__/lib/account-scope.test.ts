/** @jest-environment jsdom */
import { guardLocalStorageForUser, __test__ } from '@/lib/storage/account-scope';

const { OWNER_KEY } = __test__;

function seedAppData() {
  localStorage.setItem('bamboobot_project_v1_abc', JSON.stringify({ name: 'A project' }));
  localStorage.setItem('bamboobot_template_v1_legacy', JSON.stringify({ name: 'legacy' }));
  localStorage.setItem('bamboobot_current_session_v1', JSON.stringify({ rows: 1 }));
  localStorage.setItem('email-queue-session123', JSON.stringify({ items: [] }));
  localStorage.setItem('pdf-queue-session123', JSON.stringify({ items: [{ data: { Name: 'Recipient' } }] }));
  localStorage.setItem('bamboobot_onboarding_completed', 'true');
  localStorage.setItem('bamboobot_tour_completed', 'true');
}

describe('guardLocalStorageForUser', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adopts the current account without purging when there is no prior owner', () => {
    seedAppData();
    const purged = guardLocalStorageForUser('userA');
    expect(purged).toBe(false);
    expect(localStorage.getItem(OWNER_KEY)).toBe('userA');
    // Existing single-user data is preserved on first adoption.
    expect(localStorage.getItem('bamboobot_project_v1_abc')).not.toBeNull();
    expect(localStorage.getItem('bamboobot_current_session_v1')).not.toBeNull();
  });

  it('does nothing when the same account is seen again', () => {
    guardLocalStorageForUser('userA');
    seedAppData();
    const purged = guardLocalStorageForUser('userA');
    expect(purged).toBe(false);
    expect(localStorage.getItem('bamboobot_project_v1_abc')).not.toBeNull();
  });

  it('purges all app-owned keys when a different account signs in', () => {
    guardLocalStorageForUser('userA');
    seedAppData();
    // An unrelated third-party key must survive.
    localStorage.setItem('unrelated_key', 'keep me');

    const purged = guardLocalStorageForUser('userB');

    expect(purged).toBe(true);
    expect(localStorage.getItem(OWNER_KEY)).toBe('userB');
    expect(localStorage.getItem('bamboobot_project_v1_abc')).toBeNull();
    expect(localStorage.getItem('bamboobot_template_v1_legacy')).toBeNull();
    expect(localStorage.getItem('bamboobot_current_session_v1')).toBeNull();
    expect(localStorage.getItem('email-queue-session123')).toBeNull();
    expect(localStorage.getItem('pdf-queue-session123')).toBeNull();
    expect(localStorage.getItem('bamboobot_onboarding_completed')).toBeNull();
    expect(localStorage.getItem('bamboobot_tour_completed')).toBeNull();
    expect(localStorage.getItem('unrelated_key')).toBe('keep me');
  });

  it('is a no-op without a user id (session not ready)', () => {
    seedAppData();
    expect(guardLocalStorageForUser(null)).toBe(false);
    expect(guardLocalStorageForUser(undefined)).toBe(false);
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
    expect(localStorage.getItem('bamboobot_project_v1_abc')).not.toBeNull();
  });

  it('classifies app-owned keys but not the owner key or unrelated keys', () => {
    expect(__test__.isAppOwnedKey('bamboobot_project_v1_x')).toBe(true);
    expect(__test__.isAppOwnedKey('email-queue-abc')).toBe(true);
    expect(__test__.isAppOwnedKey('pdf-queue-abc')).toBe(true);
    expect(__test__.isAppOwnedKey('bamboobot_current_session_v1')).toBe(true);
    expect(__test__.isAppOwnedKey(OWNER_KEY)).toBe(false);
    expect(__test__.isAppOwnedKey('some_other_app_key')).toBe(false);
  });
});
