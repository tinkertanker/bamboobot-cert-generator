"use client";
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ProjectStorage } from '@/lib/project-storage';

export function useProjectMigration() {
  const { status } = useSession();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    if (status !== 'authenticated') return;

    // Peek at local projects; do not block UI
    (async () => {
      try {
        // Only consider local (browser) projects for migration prompting
        const list = await ProjectStorage.listLocalProjects();
        if (!list || list.length === 0) {
          setChecked(true);
          return;
        }
        // Simple confirm for first cut; can be replaced with a modal
        const ok = window.confirm('We found projects saved on this device. Import them to your account?');
        if (!ok) {
          setChecked(true);
          return;
        }
        const payload = [] as any[];
        for (const item of list) {
          const p = ProjectStorage.loadProject(item.id);
          if (p) payload.push(p);
        }
        const res = await fetch('/api/projects/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projects: payload }),
        });
        if (res.ok) {
          // Only clear after success
          ProjectStorage.clearAllProjects();
        }
      } catch (e) {
        console.error('Migration check/import failed:', e);
      } finally {
        setChecked(true);
      }
    })();
  }, [status, checked]);
}
