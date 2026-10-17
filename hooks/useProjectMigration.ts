"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ProjectStorage, type SavedProject } from '@/lib/project-storage';

export const IMPORT_DECLINED_KEY = 'bamboobot_project_import_declined';

function readDeclined(): boolean {
  try {
    return localStorage.getItem(IMPORT_DECLINED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDecline(): void {
  try {
    localStorage.setItem(IMPORT_DECLINED_KEY, 'true');
  } catch {
    // Storage unavailable; the prompt will simply show again next time
  }
}

/**
 * Offers to copy browser-saved projects into the signed-in user's account.
 *
 * Only runs when projects are stored on the server: without server storage
 * the browser copies are the only copies, so there is nothing to import into.
 * Browser copies are deleted only once the server confirms each one was saved.
 */
export function useProjectMigration() {
  const { status } = useSession();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (status !== 'authenticated') return;

    if (!ProjectStorage.isServerMode() || readDeclined()) {
      setChecked(true);
      return;
    }

    // Peek at local projects; do not block UI
    (async () => {
      try {
        const list = await ProjectStorage.listLocalProjects();
        const payload: SavedProject[] = [];
        for (const item of list) {
          const p = ProjectStorage.loadLocalProject(item.id);
          if (p) payload.push(p);
        }
        if (payload.length === 0) return;

        const ok = window.confirm('We found projects saved on this device. Import them to your account?');
        if (!ok) {
          rememberDecline();
          return;
        }

        const res = await fetch('/api/projects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projects: payload }),
        });
        const json = await res.json().catch(() => ({}));
        const confirmed = new Set<string>(
          res.ok && Array.isArray(json?.importedIds) ? json.importedIds.map(String) : []
        );

        // Only remove browser copies the server confirmed it saved
        const saved = payload.filter(p => confirmed.has(String(p.id))).map(p => p.id);
        if (saved.length > 0) ProjectStorage.deleteLocalProjects(saved);

        if (saved.length < payload.length) {
          const reason = typeof json?.error === 'string' ? ` (${json.error})` : '';
          window.alert(
            `Some projects could not be imported${reason}. They are still saved on this device, and you will be asked again next time.`
          );
        }
      } catch (e) {
        console.error('Migration check/import failed:', e);
      } finally {
        setChecked(true);
      }
    })();
  }, [status, checked]);
}
