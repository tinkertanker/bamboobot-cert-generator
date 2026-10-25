import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { COLORS, GRADIENTS } from '@/utils/styles';

interface AgentKey {
  id: string;
  label: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface AgentJob {
  id: string;
  label: string;
  status: string;
  total: number;
  progress?: number | null;
  createdAt: string;
  expiresAt: string;
  inputHash: string;
  inputUrl?: string | null;
  error?: string | null;
  sampleUrl?: string | null;
  files: { filename: string; url: string; sha256: string; size: number }[];
  zipUrl?: string | null;
  manifestUrl?: string | null;
  approvedAt?: string | null;
  fields?: string[];
  ignoredFields?: string[];
  sampleRowIds?: string[];
}

const button = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-[var(--agent-primary)] transition-colors hover:bg-[var(--agent-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--agent-accent)] disabled:opacity-50 disabled:cursor-not-allowed';
const link = 'text-sm text-[var(--agent-accent)] underline underline-offset-2 hover:text-[var(--agent-primary)]';
const cardStyle = { backgroundColor: COLORS.cardBg, borderColor: COLORS.border };
const isActive = (job: AgentJob) => ['preparing', 'queued', 'running'].includes(job.status);
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

async function request<T>(url: string, method?: string, body?: unknown): Promise<T> {
  const response = await fetch(url, method ? {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  } : undefined);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}). Please refresh and try again.`), { status: response.status });
  }
  return data as T;
}

export default function AgentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const jobId = typeof router.query.job === 'string' ? router.query.job : '';
  const account = status === 'authenticated' ? session?.user?.email : null;
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [job, setJob] = useState<AgentJob | null>(null);
  const [label, setLabel] = useState('');
  const [lifetime, setLifetime] = useState('30');
  const [token, setToken] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [keyError, setKeyError] = useState('');
  const [jobError, setJobError] = useState('');
  const [actionError, setActionError] = useState('');
  const [keysLoading, setKeysLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [keysVersion, setKeysVersion] = useState(0);
  const [jobsVersion, setJobsVersion] = useState(0);

  useEffect(() => {
    setToken('');
    setKeys([]);
    setJobs([]);
    setJob(null);
  }, [account]);

  useEffect(() => { setCopyStatus('idle'); }, [token]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setKeysLoading(true);
    setKeyError('');
    request<{ keys: AgentKey[] }>('/api/agent/keys')
      .then(data => { if (!cancelled) setKeys(data.keys); })
      .catch(error => { if (!cancelled) setKeyError(error.message); })
      .finally(() => { if (!cancelled) setKeysLoading(false); });
    return () => { cancelled = true; };
  }, [account, keysVersion]);

  useEffect(() => {
    if (!account || !router.isReady) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setJobsLoading(true);
    setJob(null);
    const load = async () => {
      try {
        const [list, detail] = await Promise.all([
          request<{ jobs: AgentJob[] }>('/api/agent/jobs').then(list => {
            if (!cancelled) setJobs(list.jobs);
            return list;
          }),
          jobId ? request<{ job: AgentJob }>(`/api/agent/jobs/${encodeURIComponent(jobId)}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setJob(detail?.job ?? null);
        setJobError('');
        if (list.jobs.some(isActive) || (detail && isActive(detail.job))) timer = setTimeout(load, 3000);
      } catch (error) {
        if (!cancelled) {
          setJobError(error instanceof Error ? error.message : 'Could not load jobs.');
          // Expired/deleted jobs and authentication failures need user action,
          // not an indefinite poll. Network errors, throttling and 5xx retry.
          if (!(error instanceof Error) || !('status' in error) || error.status === 429 || (typeof error.status === 'number' && error.status >= 500)) timer = setTimeout(load, 3000);
        }
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [account, router.isReady, jobId, jobsVersion]);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setBusy('create-key');
    setKeyError('');
    setToken('');
    try {
      const data = await request<{ token: string }>('/api/agent/keys', 'POST', {
        label: label.trim(), scopes: ['certificates:write', 'certificates:read'], expiresInDays: Number(lifetime),
      });
      setToken(data.token);
      setLabel('');
      setKeysVersion(value => value + 1);
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : 'Could not create key.');
    } finally { setBusy(''); }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  async function revokeKey(key: AgentKey) {
    if (!window.confirm(`Revoke “${key.label}”? Agents using this key will lose access.`)) return;
    setBusy(key.id);
    setKeyError('');
    try {
      await request(`/api/agent/keys?id=${encodeURIComponent(key.id)}`, 'DELETE');
      setKeysVersion(value => value + 1);
    } catch (error) {
      setKeyError(error instanceof Error ? error.message : 'Could not revoke key.');
    } finally { setBusy(''); }
  }

  async function jobAction(action: 'approve' | 'retry' | 'delete') {
    if (!job) return;
    if (action === 'delete' && !window.confirm(`Delete “${job.label}” and its data? This cannot be undone.`)) return;
    setBusy(action);
    setActionError('');
    try {
      await request(`/api/agent/jobs/${encodeURIComponent(job.id)}`, action === 'delete' ? 'DELETE' : 'POST',
        action === 'approve' ? { action, inputHash: job.inputHash } : action === 'retry' ? { action } : undefined);
      setJob(null);
      setJobsVersion(value => value + 1);
      if (action === 'delete') await router.replace('/agent');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update job.');
      // Reload the authoritative status after a rejected or uncertain mutation.
      setJobsVersion(value => value + 1);
    } finally { setBusy(''); }
  }

  if (status === 'loading') return <main className="p-8" role="status">Loading account…</main>;
  if (!account) return <main className="p-8">Please sign in to manage agent access and approve samples.</main>;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8" style={{
      backgroundColor: COLORS.background, color: COLORS.textPrimary,
      '--agent-primary': COLORS.primary, '--agent-accent': COLORS.primaryMedium, '--agent-hover': COLORS.successLight,
    } as CSSProperties}>
      <Head><title>Agent access — Bamboobot</title><meta name="referrer" content="same-origin" /></Head>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg p-5 shadow-sm" style={{ background: GRADIENTS.primary }}>
          <div className="min-w-0 flex-1 basis-72"><h1 className="text-2xl font-bold" style={{ color: COLORS.amber }}>Agent access</h1><p className="mt-1 text-sm text-white/90">Let an external agent prepare a batch. You approve the actual sample before Bamboobot publishes the files.</p></div>
          <Link href="/app" className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Back to app</Link>
        </header>

        <section aria-labelledby="getting-started-heading" className="rounded-lg border p-5 space-y-3 shadow-sm" style={cardStyle}>
          <h2 id="getting-started-heading" className="text-lg font-semibold" style={{ color: COLORS.primary }}>Get started with your agent</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
            <li>Create a key and save it in your agent’s secret store—not a prompt, repository or log.</li>
            <li>Give your agent the <a href="https://github.com/tinkertanker/bamboobot-cert-generator/blob/main/docs/AGENT_CERTIFICATES.md" className={link}>agent guide and API examples</a> to submit recipients and layout.</li>
            <li>Review its actual sample PDF and all recipient inputs, then approve. Collect the PDFs, ZIP and manifest when ready; no open browser needed.</li>
          </ol>
          <p className="text-sm text-gray-600">Send only necessary data: unprinted columns are stored too. Downloads require authentication. Drafts expire after 24 hours; approved jobs seven days after approval. See the guide for limits and cleanup details.</p>
        </section>

        <section aria-labelledby="keys-heading" className="rounded-lg border p-5 space-y-4 shadow-sm" style={cardStyle}>
          <h2 id="keys-heading" className="text-lg font-semibold" style={{ color: COLORS.primary }}>API keys</h2>
          <p className="text-sm text-gray-600">Keys can read and prepare certificate jobs, but cannot approve samples. Only you, signed in here, can approve a job. Keys expire after their chosen lifetime — 30 days by default, up to 10 years.</p>
          <form onSubmit={createKey} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 basis-56 min-w-0"><label htmlFor="key-label" className="block text-sm font-medium mb-1">Key label</label><input id="key-label" value={label} onChange={event => setLabel(event.target.value)} required maxLength={100} placeholder="e.g. Certificate assistant" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[var(--agent-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)]" /></div>
            <div><label htmlFor="key-lifetime" className="block text-sm font-medium mb-1">Expires after</label><div className="relative"><select id="key-lifetime" value={lifetime} onChange={event => setLifetime(event.target.value)} className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-3 pr-9 py-2 text-sm focus:border-[var(--agent-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--agent-accent)]">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="3650">10 years</option>
            </select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" /></div></div>
            <button type="submit" disabled={!!busy || !label.trim()} className={`${button} hover:brightness-110`} style={{ background: GRADIENTS.primary, color: COLORS.white }}>{busy === 'create-key' ? 'Creating…' : 'Create API key'}</button>
          </form>
          {token && <div className="rounded-md border p-4 space-y-2" style={{ backgroundColor: COLORS.highlightBg, borderColor: COLORS.highlightBorder }}>
            <p className="font-medium" role="status">Save this token now. It is shown only once.</p>
            <p className="text-sm">Treat it like a password. It cannot approve samples.</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 break-all select-all rounded-md border border-amber-200/60 bg-white/70 px-3 py-2 text-sm">{token}</code>
              <button type="button" className={`${button} inline-flex h-9 w-9 shrink-0 items-center justify-center p-0`} aria-label="Copy API key" title="Copy API key" onClick={() => void copyToken()}>
                {copyStatus === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            <p role="status" className="text-sm" style={{ color: COLORS.primaryMedium }}>{copyStatus === 'copied' ? 'Copied' : ''}</p>
            {copyStatus === 'error' && <p role="alert" className="text-sm text-red-700">Could not copy. Select the key and copy it manually.</p>}
            <button type="button" className={button} onClick={() => setToken('')}>Dismiss token</button>
          </div>}
          {keyError && <p role="alert" className="text-sm text-red-700">{keyError}</p>}
          <button type="button" onClick={() => setKeysVersion(value => value + 1)} disabled={keysLoading || !!busy} className={button}>Refresh keys</button>
          {keysLoading ? <p role="status" className="text-sm text-gray-500">Loading keys…</p> : keys.length === 0 ? <p className="text-sm text-gray-500">No API keys yet.</p> : <ul className="divide-y divide-gray-100">
            {keys.map(key => <li key={key.id} className="py-3 flex flex-wrap justify-between gap-3">
              <div className="min-w-0"><h3 className="font-medium break-words">{key.label}</h3><p className="text-xs text-gray-500 break-all">{key.scopes.join(', ')}</p><p className="text-xs text-gray-500">Expires: {date(key.expiresAt)} · Last used: {date(key.lastUsedAt)}</p>{key.revokedAt && <p className="text-sm text-gray-500">Revoked {date(key.revokedAt)}</p>}</div>
              {!key.revokedAt && <button type="button" className={button} disabled={!!busy} onClick={() => void revokeKey(key)} aria-label={`Revoke ${key.label}`}>Revoke</button>}
            </li>)}
          </ul>}
        </section>

        <section aria-labelledby="jobs-heading" className="rounded-lg border p-5 space-y-4 shadow-sm" style={cardStyle}>
          <div className="flex items-center justify-between gap-3"><h2 id="jobs-heading" className="text-lg font-semibold" style={{ color: COLORS.primary }}>Certificate jobs</h2><button type="button" className={button} disabled={jobsLoading || !!busy} onClick={() => setJobsVersion(value => value + 1)}>Refresh jobs</button></div>
          <p className="text-sm text-gray-600">Preparing, queued and running jobs refresh every 3 seconds. Preparation and approved jobs continue without this browser; the agent can collect files once the whole batch is complete.</p>
          {jobError && <p role="alert" className="text-sm text-red-700">{jobError}</p>}
          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
          {jobsLoading && <p role="status" className="text-sm text-gray-500">Loading jobs…</p>}
          {!jobsLoading && !jobs.length && !jobError && <p className="text-sm text-gray-500">No jobs yet. Ask your agent to prepare a certificate job using an API key.</p>}
          <ul className="divide-y divide-gray-100">
            {jobs.map(item => <li key={item.id} className="py-3 flex flex-wrap justify-between gap-2">
              <div className="min-w-0"><Link href={{ pathname: '/agent', query: { job: item.id } }} aria-current={jobId === item.id ? 'page' : undefined} className={`${link} font-medium break-words`}>{item.label || item.id}</Link><p className="text-xs text-gray-500">{item.total} recipients · Created {date(item.createdAt)} · Expires {date(item.expiresAt)}</p></div>
              <div className="text-sm text-gray-600" aria-live="polite"><span>{item.status.replace(/_/g, ' ')}</span>{isActive(item) && typeof item.progress === 'number' && <p>Progress: {item.progress}/{item.total}</p>}</div>
            </li>)}
          </ul>
        </section>

        {job && job.id === jobId && <section aria-labelledby="sample-heading" className="rounded-lg border p-5 space-y-4 shadow-sm" style={cardStyle}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="sample-heading" className="text-lg font-semibold break-words" style={{ color: COLORS.primary }}>{job.label || job.id}</h2><span className="text-sm text-gray-600">{job.status.replace(/_/g, ' ')}</span></div>
          {isActive(job) && typeof job.progress === 'number' && <p className="text-sm text-gray-600" role="status">Progress: {job.progress}/{job.total}</p>}
          <dl className="space-y-2 text-sm">
            <div><dt className="font-medium">Recipients</dt><dd>{job.total}</dd></div>
            <div><dt className="font-medium">Mapped fields</dt><dd>{job.fields?.length ? <ul>{job.fields.map(field => <li key={field}>{field}</li>)}</ul> : 'No mapped fields supplied.'}</dd></div>
            <div><dt className="font-medium">Ignored columns (not printed)</dt><dd>{job.ignoredFields?.join(', ') || 'None'}</dd></div>
            <div><dt className="font-medium">Sample row IDs</dt><dd className="break-all">{job.sampleRowIds?.length ? <ol aria-label="Sample PDF pages">{job.sampleRowIds.map((rowId, index) => <li key={index}>PDF page {index + 1}: {rowId}</li>)}</ol> : '—'}</dd></div>
            <div><dt className="font-medium">Immutable input hash</dt><dd><code className="break-all">{job.inputHash}</code></dd></div>
            <div><dt className="font-medium">Expires</dt><dd>{date(job.expiresAt)}</dd></div>
            {job.approvedAt && <div><dt className="font-medium">Approved</dt><dd>{date(job.approvedAt)}</dd></div>}
          </dl>
          {job.inputUrl && job.status !== 'expired' && <p><a href={job.inputUrl} className={link}>Download all frozen recipient inputs</a><span className="block mt-1 text-xs text-gray-500">Authenticated JSON download of the immutable snapshot for every recipient.</span></p>}
          {job.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{job.error}</p>}
          {job.sampleUrl && job.status !== 'expired' && <>
            <a href={job.sampleUrl} target="_blank" rel="noopener noreferrer" className={link}>Open actual sample PDF in a new tab</a>
            <iframe title="Sample certificate PDF" src={job.sampleUrl} className="w-full h-[32rem] rounded-md border border-gray-200" />
            <p className="text-xs text-gray-500">If the embedded PDF does not display, use the sample link above.</p>
          </>}
          {job.status === 'awaiting_approval' && <div className="rounded-md border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm">Review all frozen recipient inputs using the download above, as well as the actual PDF, recipient count and mapped fields. Approving authorises generation for all {job.total} recipients with these immutable inputs, without further prompts.</p>
            {!job.sampleUrl && <p className="text-sm text-red-700">No sample PDF is available. Refresh before approving.</p>}
            <button type="button" disabled={!!busy || !job.sampleUrl || !!jobError} onClick={() => void jobAction('approve')} className={button}>{busy === 'approve' ? 'Approving…' : 'Approve sample and generate'}</button>
          </div>}
          {job.status === 'failed' && <button type="button" className={button} disabled={!!busy} onClick={() => void jobAction('retry')}>Retry generation</button>}
          {job.status === 'completed' && <div className="space-y-3">
            <h3 className="font-medium">Generated files</h3>
            <div className="flex flex-wrap gap-4">{job.zipUrl && <a href={job.zipUrl} className={link}>Download ZIP</a>}{job.manifestUrl && <a href={job.manifestUrl} className={link}>Download manifest</a>}</div>
            <ul className="space-y-2">{job.files.map(file => <li key={file.filename} className="text-sm"><a href={file.url} className={`${link} break-all`}>{file.filename}</a><span className="ml-2 text-gray-500">{file.size.toLocaleString()} bytes</span><p className="text-xs text-gray-500 break-all">SHA-256: {file.sha256}</p></li>)}</ul>
          </div>}
          {job.status === 'expired' && <p className="text-sm text-gray-600">This job has expired. Ask your agent to prepare a new job and review its sample.</p>}
          <div className="border-t border-gray-100 pt-4"><button type="button" className={button} disabled={!!busy} onClick={() => void jobAction('delete')}>Delete job and data</button></div>
        </section>}
      </div>
    </main>
  );
}
