import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession } from 'next-auth/react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SessionStorage } from '@/lib/session-storage';
import { OWNER_KEY, QUARANTINE_PREFIX } from '@/lib/storage/account-scope';

export function SessionRecoveryModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [copies, setCopies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);

  const verifyAccount = useCallback(async () => {
    // Recheck with the server, not a possibly stale SessionProvider snapshot.
    const session = await getSession();
    if (!userId || (session?.user as { id?: string } | undefined)?.id !== userId) {
      throw new Error('Account changed');
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setCopies([]);
    setLoading(true);
    setBusy(false);
    setError(null);
    setNotice(null);
    try {
      await verifyAccount();
      if (request !== generation.current) return;
      setCopies(SessionStorage.listRecoverySessions(userId));
    } catch {
      if (request === generation.current) {
        setError('Recovery is unavailable. Sign in to the original account, allow browser storage, then retry. No retained data has been changed.');
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [userId, verifyAccount]);

  useEffect(() => {
    const requests = generation;
    void refresh();
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === OWNER_KEY || event.key.startsWith(QUARANTINE_PREFIX)) void refresh();
    };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('focus', refresh);
    return () => {
      requests.current++;
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const download = async (key: string, tableOnly: boolean) => {
    const request = generation.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await verifyAccount();
      if (request !== generation.current) return;
      const original = SessionStorage.readRecoverySession(key, userId);
      // Wrapping the raw string in JSON preserves even malformed JSON and lone
      // UTF-16 surrogates. Downloading it as bare UTF-8 would change those bytes.
      let data = JSON.stringify({ format: 'bamboobot-session-recovery-v1', session: original }, null, 2);
      if (tableOnly) {
        let table: unknown;
        try { table = JSON.parse(original)?.tableInput; } catch { /* Keep the original downloadable. */ }
        if (typeof table !== 'string') {
          setError('This copy has no readable table text. Download the original recovery file to repair it manually; the retained copy is unchanged.');
          return;
        }
        data = table;
      }
      const url = URL.createObjectURL(new Blob([data], { type: tableOnly ? 'text/plain;charset=utf-8' : 'application/json' }));
      const link = document.createElement('a');
      try {
        link.href = url;
        link.download = `bamboobot-session-${key.slice(-36)}.${tableOnly ? 'txt' : 'json'}`;
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(url);
      }
      setNotice('Download started. Your current project and retained copies are unchanged.');
    } catch {
      if (request === generation.current) {
        setCopies([]);
        setError('Recovery is unavailable. Your account or browser storage may have changed. Retry to check again; no retained data has been changed.');
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} width="w-[36rem]" ariaLabelledBy="session-recovery-title">
      <div className="space-y-4">
        <h2 id="session-recovery-title" className="text-xl font-semibold text-gray-900">Recover session data</h2>
        <p className="text-sm text-gray-600">
          Download a session preserved for this account in this browser. Nothing is loaded into your current project or deleted.
        </p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Older copies without recorded ownership stay locked. Signing in does not establish ownership of those copies.
        </div>
        {loading ? <p role="status" className="text-sm text-gray-600">Checking account and browser storage…</p> : (
          <>
            {!error && copies.length === 0 && <p className="text-sm text-gray-600">No recovery copies are available for this account in this browser.</p>}
            {copies.length > 0 && (
              <>
                <p className="text-sm text-gray-600">
                  Open the table text in a text editor, correct or split oversized data, then paste it into a new project.
                  The original recovery file keeps the exact stored session in its <code>session</code> field, even if damaged. It is not a project import file.
                </p>
                <ul className="space-y-3" aria-label="Session recovery copies">
                  {copies.map((key, index) => (
                    <li key={key} className="rounded-lg border border-gray-200 p-3">
                      <h3 className="mb-2 text-sm font-semibold text-gray-900">Recovery copy {index + 1}</h3>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void download(key, true)} aria-label={`Download table text from copy ${index + 1}`}>Download table text</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void download(key, false)} aria-label={`Download original recovery file ${index + 1}`}>Download original</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
        <div className="flex justify-end gap-3">
          {error && <Button variant="outline" disabled={loading || busy} onClick={() => void refresh()}>Retry</Button>}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
