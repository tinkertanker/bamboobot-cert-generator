import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import type { CertificateJob } from '@prisma/client';
import prisma from '@/lib/server/prisma';
import { cloudflare } from '@/lib/server/cloudflare';
import { readWorkerObject } from '@/lib/server/worker-files';
import { AgentError, validateAgentInput } from './input';
import { digest, makeTemplate, rendererVersion, renderRow } from './render';
import type { Artifact, Manifest, Snapshot } from './jobs';
import { writeWorkerZip } from './worker-zip';
import { logAgentError } from './log';

const DAY = 86400000;
const MAX_BYTES = 250 * 1024 * 1024;
const MAX_PDF = 8 * 1024 * 1024;
// Includes immutable inputs/samples and at most three interrupted object writes.
const OVERHEAD = 160 * 1024 * 1024;
const RESERVATION = 2 * MAX_BYTES + OVERHEAD;
const LEASE = 5 * 60_000;
const iso = (time = Date.now()) => new Date(time).toISOString();
export interface WorkerCheckpoint {
  requestKey: string;
  templateKey?: string;
  sampleKey?: string;
  files: Array<Artifact & { objectKey: string }>;
  bytes: number;
}
const checkpoint = (job: CertificateJob) => job.checkpoint as unknown as WorkerCheckpoint;

async function owned(ownerId: string, id: string) {
  const job = await prisma.certificateJob.findFirst({ where: { id, ownerId } });
  if (!job) throw new AgentError('Job not found', 404);
  if (job.status === 'expired' || job.expiresAt <= new Date()) throw new AgentError('Job has expired', 410);
  return job;
}

async function bytes(key: string, limit: number) {
  const result = await readWorkerObject(key, limit);
  if (!result) throw new AgentError('Artifact storage is unavailable; no incomplete batch will be substituted', 503);
  return result;
}

export async function createWorkerDraft(ownerId: string, value: unknown, idempotencyKey: string) {
  if (!/^[\w-]{1,100}$/.test(idempotencyKey)) throw new AgentError('Supply a valid Idempotency-Key header');
  const input = validateAgentInput(value);
  if (Buffer.byteLength(JSON.stringify(input)) > 1024 * 1024) throw new AgentError('Recipient/layout JSON exceeds 1 MB', 413);
  const option = (value as { template?: { base64?: unknown } }).template;
  if (option !== undefined && (!option || typeof option !== 'object' || typeof option.base64 !== 'string')) throw new AgentError('Supply template.base64 or omit template for the default');
  if (option?.base64 && (option.base64 as string).length > 5_600_000) throw new AgentError('Worker templates must be at most 4 MB', 413);
  const version = await rendererVersion();
  const inputHash = digest(JSON.stringify({ input, template: option?.base64 ?? 'default-v1', version }));
  const ingest = async (job: CertificateJob) => {
    if (job.status !== 'ingesting') return job;
    // Reserve durable capacity BEFORE accepting bytes into R2. A retry after
    // an unknown upload/DB response resumes this same immutable request.
    await cloudflare().env.FILES.put(checkpoint(job).requestKey, JSON.stringify({ base64: option?.base64 }));
    await cloudflare().env.DB.prepare(`UPDATE CertificateJob SET status='preparing' WHERE id=? AND status='ingesting' AND julianday(expiresAt)>julianday(?)`)
      .bind(job.id, iso()).run();
    return owned(ownerId, job.id);
  };
  const replay = async () => {
    const prior = await prisma.certificateJob.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } } });
    if (!prior) return null;
    if (prior.status === 'expired' || prior.expiresAt <= new Date()) throw new AgentError('Job has expired; choose a new idempotency key', 409);
    if (prior.inputHash !== inputHash) throw new AgentError('Idempotency key already belongs to different inputs', 409);
    return { job: await ingest(prior), created: false };
  };
  const prior = await replay();
  if (prior) return prior;
  const id = randomUUID();
  const requestKey = `agent/${id}/request.json`;
  const longest = input.rows.reduce((best, row, i) => Object.keys(input.positions).reduce((n, k) => n + row.fields[k].length, 0) > Object.keys(input.positions).reduce((n, k) => n + input.rows[best].fields[k].length, 0) ? i : best, 0);
  const frozen: Snapshot = { ...input, templateHash: '', samples: [...new Set([0, longest, input.rows.length - 1])], sampleHashes: [],
    filenames: input.rows.map((row, i) => `${String(i + 1).padStart(4, '0')}-${row.id.slice(0, 50)}.pdf`) };
  try {
    // Admission trigger and unique key are durable across every web isolate.
    await cloudflare().env.DB.prepare(`INSERT INTO CertificateJob
      (id,ownerId,label,idempotencyKey,inputHash,rendererVersion,input,sampleHash,total,status,checkpoint,storageBytes,createdAt,expiresAt)
      VALUES(?,?,?,?,?,?,?,?,?,'ingesting',?,?,?,?)`).bind(id, ownerId, input.label, idempotencyKey, inputHash, version,
      JSON.stringify(frozen), '', input.rows.length, JSON.stringify({ requestKey, files: [], bytes: 0 }), RESERVATION, iso(), iso(Date.now() + DAY)).run();
  } catch (error) {
    // A lost successful response must not delete possibly committed inputs.
    const prior = await replay();
    if (prior) return prior;
    if (String(error).includes('AGENT_CAPACITY')) throw new AgentError('Pending job or artifact capacity reached; delete old jobs', 429);
    throw error;
  }
  return { job: await ingest(await owned(ownerId, id)), created: true };
}

export async function approveWorkerJob(ownerId: string, id: string, inputHash: unknown) {
  const job = await owned(ownerId, id);
  if (inputHash !== job.inputHash) throw new AgentError('The preview revision has changed; review the new sample', 409);
  if (job.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; create and approve a new draft', 409);
  const state = checkpoint(job);
  if (!state.sampleKey || digest(await bytes(state.sampleKey, 3 * MAX_PDF)) !== job.sampleHash) throw new AgentError('Sample integrity check failed', 409);
  try {
    // The approval trigger charges quota in this same conditional statement.
    // Zero changed rows never runs the trigger, so replay cannot charge twice.
    await cloudflare().env.DB.prepare(`UPDATE CertificateJob SET status='queued',approvedAt=?,expiresAt=?
      WHERE id=? AND ownerId=? AND status='awaiting_approval' AND inputHash=? AND julianday(expiresAt)>julianday(?)`)
      .bind(iso(), iso(Date.now() + 7 * DAY), id, ownerId, inputHash, iso()).run();
  } catch (error) {
    if (String(error).includes('AGENT_QUOTA')) throw new AgentError('Daily PDF batch quota reached', 403);
    throw error;
  }
  const current = await owned(ownerId, id);
  if (current.status === 'preparing' || current.status === 'failed') throw new AgentError('Wait for a complete sample before approving', 409);
  return current;
}

export async function retryWorkerJob(ownerId: string, id: string) {
  const job = await owned(ownerId, id);
  if (!job.approvedAt || job.status !== 'failed' || job.attempts >= 3) throw new AgentError('Create a new draft and review its sample', 409);
  if (job.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; new approval is required', 409);
  await cloudflare().env.DB.prepare(`UPDATE CertificateJob SET status='queued',error=NULL,retryAt=NULL
    WHERE id=? AND ownerId=? AND status='failed' AND attempts<3 AND julianday(expiresAt)>julianday(?)`).bind(id, ownerId, iso()).run();
  return owned(ownerId, id);
}

export async function expireWorkerJob(ownerId: string, id: string) {
  await owned(ownerId, id);
  await cloudflare().env.DB.prepare(`UPDATE CertificateJob SET status='expired',input='{}',checkpoint='{}',manifest=NULL,
    attemptToken=NULL,storageBytes=0,expiresAt=? WHERE id=? AND ownerId=?`).bind(iso(), id, ownerId).run();
  // Physical deletion is bounded and retryable in cron; access is revoked now.
}

/** One persisted lease across web isolates and cron invocations bounds decoding. */
export async function processWorkerCertificateJobs(budgetMs = 2_000) {
  if (process.env.AGENT_CERTIFICATES_ENABLED !== 'true') return;
  const { DB: db, FILES: files } = cloudflare().env;
  const token = randomUUID();
  const now = iso();
  await db.prepare(`UPDATE CertificateJob SET status='failed',attemptToken=NULL,error='Retry budget exhausted'
    WHERE status IN ('preparing','queued','running') AND attempts>=3 AND (leaseUntil IS NULL OR julianday(leaseUntil)<=julianday(?))`).bind(now).run();
  const claimed = await db.prepare(`UPDATE CertificateJob SET attemptToken=?,leaseUntil=?,
    attempts=attempts+CASE WHEN attemptToken IS NOT NULL THEN 1 ELSE 0 END,
    status=CASE WHEN status='queued' THEN 'running' ELSE status END
    WHERE id=(SELECT id FROM CertificateJob WHERE status IN ('preparing','queued','running') AND attempts<3
      AND julianday(expiresAt)>julianday(?) AND (leaseUntil IS NULL OR julianday(leaseUntil)<=julianday(?))
      AND (retryAt IS NULL OR julianday(retryAt)<=julianday(?))
      AND NOT EXISTS(SELECT 1 FROM CertificateJob WHERE status IN ('preparing','running') AND julianday(leaseUntil)>julianday(?))
      ORDER BY coalesce(leaseUntil,createdAt),id LIMIT 1)
    RETURNING id`).bind(token, iso(Date.now() + LEASE), now, now, now, now).first<{ id: string }>();
  if (!claimed) return;
  const job = await prisma.certificateJob.findUniqueOrThrow({ where: { id: claimed.id } });
  const state = checkpoint(job);
  const input = job.input as unknown as Snapshot;
  const prefix = `agent/${job.id}/${token}`;
  const fence = `id=? AND attemptToken=? AND status IN ('preparing','running') AND julianday(expiresAt)>julianday(?)`;
  const save = async (status: string, sampleHash = job.sampleHash) => db.prepare(`UPDATE CertificateJob SET input=?,checkpoint=?,
    status=?,progress=?,sampleHash=?,storageBytes=?,attemptToken=NULL,leaseUntil=? WHERE ${fence}`).bind(JSON.stringify(input), JSON.stringify(state), status,
    state.files.length, sampleHash, status === 'preparing' ? RESERVATION : 2 * state.bytes + OVERHEAD, iso(), job.id, token, iso()).run();
  const persist = async () => {
    const result = await db.prepare(`UPDATE CertificateJob SET input=?,checkpoint=?,progress=? WHERE ${fence}`)
      .bind(JSON.stringify(input), JSON.stringify(state), state.files.length, job.id, token, iso()).run();
    if (!result.meta.changes) throw new AgentError('Job cancelled or attempt superseded', 409);
  };
  try {
    if (job.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; create and approve a new draft');
    if (job.status === 'preparing') {
      const deadline = Date.now() + budgetMs;
      if (!state.templateKey) {
        const source = JSON.parse((await bytes(state.requestKey, 6 * 1024 * 1024)).toString()) as { base64?: string };
        const rawInput = { label: input.label, rows: input.rows, positions: input.positions };
        if (digest(JSON.stringify({ input: rawInput, template: source.base64 ?? 'default-v1', version: job.rendererVersion })) !== job.inputHash) throw new AgentError('Frozen input integrity check failed');
        const template = await makeTemplate(source.base64);
        if (template.length > MAX_PDF) throw new AgentError('Template PDF exceeds 8 MB');
        input.templateHash = digest(template);
        state.templateKey = `${prefix}/template.pdf`;
        await files.put(state.templateKey, template);
        await persist();
      }
      const templateBytes = await bytes(state.templateKey, MAX_PDF);
      if (digest(templateBytes) !== input.templateHash) throw new AgentError('Template integrity check failed');
      const template = await PDFDocument.load(templateBytes);
      // Keep ALL preflight PDFs: after approval we publish these exact bytes,
      // not a second rendering that might differ from the approved revision.
      for (let count = 0; state.files.length < job.total; count++) {
        if (count && Date.now() >= deadline) break;
        const index = state.files.length;
        let output: Uint8Array;
        try { output = await renderRow(template, input, index); }
        catch { throw new AgentError(`Recipient ${index + 1} has unsupported glyphs or text that does not fit; revise the layout`); }
        if (output.length > MAX_PDF || state.bytes + output.length > MAX_BYTES) throw new AgentError('PDF or batch artifact limit exceeded');
        const objectKey = `${prefix}/${index}.pdf`;
        await files.put(objectKey, output);
        state.files.push({ filename: input.filenames[index], rowId: input.rows[index].id, size: output.length, sha256: digest(output), objectKey });
        state.bytes += output.length;
        // Checkpoint after EACH object, limiting both crash replay work and
        // unreferenced bytes rather than losing a whole preparation slice.
        await persist();
      }
      if (state.files.length !== job.total) { await save('preparing'); return; }
      const sample = await PDFDocument.create();
      input.sampleHashes = [];
      for (const index of input.samples) {
        const output = await bytes(state.files[index].objectKey, MAX_PDF);
        if (digest(output) !== state.files[index].sha256) throw new AgentError('Sample integrity check failed');
        input.sampleHashes.push(digest(output));
        const doc = await PDFDocument.load(output);
        sample.addPage((await sample.copyPages(doc, [0]))[0]);
      }
      const output = await sample.save();
      state.sampleKey = `${prefix}/sample.pdf`;
      await files.put(state.sampleKey, output);
      await save('awaiting_approval', digest(output));
      return;
    }
    if (!job.approvedAt || state.files.length !== job.total || !state.sampleKey) throw new AgentError('Approved immutable outputs are incomplete');
    if (digest(await bytes(state.sampleKey, 3 * MAX_PDF)) !== job.sampleHash) throw new AgentError('Approved sample integrity check failed');
    const partial = { jobId: job.id, inputHash: job.inputHash, rendererVersion: job.rendererVersion, total: job.total,
      files: state.files, attempt: token, expiresAt: job.expiresAt.toISOString() };
    const zipKey = `${prefix}/certificates.zip`;
    const zip = await writeWorkerZip(files, zipKey, state.files, partial, MAX_BYTES);
    const manifest: Manifest = { ...partial, zip: { ...zip, objectKey: zipKey } };
    // No download path can observe partial/missing outputs. Expiry/DELETE and a
    // newer attempt fence this final publication even if R2 writes finished.
    await db.prepare(`UPDATE CertificateJob SET status='completed',manifest=?,progress=total,storageBytes=?,attemptToken=NULL,leaseUntil=NULL
      WHERE ${fence}`).bind(JSON.stringify(manifest), state.bytes + zip.size + OVERHEAD, job.id, token, iso()).run();
  } catch (error) {
    logAgentError('Agent Worker slice failed', error);
    const terminal = error instanceof AgentError || job.attempts + 1 >= 3;
    await db.prepare(`UPDATE CertificateJob SET status=?,error=?,attempts=attempts+1,attemptToken=NULL,leaseUntil=NULL,retryAt=?,storageBytes=?
      WHERE ${fence}`).bind(terminal ? 'failed' : job.approvedAt ? 'queued' : 'preparing', error instanceof AgentError ? error.message
      : terminal ? 'Storage or rendering failed; retry budget exhausted' : 'Storage or rendering failed; retry scheduled',
      iso(Date.now() + 60_000), terminal ? state.bytes + OVERHEAD : job.storageBytes, job.id, token, iso()).run();
  }
}

/** Bounded private R2 expiry, including abandoned and superseded attempts. */
export async function cleanupWorkerCertificateJobs() {
  if (process.env.AGENT_CERTIFICATES_ENABLED !== 'true') return;
  const { DB: db, FILES: files } = cloudflare().env;
  await db.prepare(`UPDATE CertificateJob SET status='expired',input='{}',checkpoint='{}',manifest=NULL,
    attemptToken=NULL,storageBytes=0 WHERE status!='expired' AND julianday(expiresAt)<=julianday(?)`).bind(iso()).run();
  const cursor = await db.prepare('SELECT cursor FROM MaintenanceCursor WHERE id=?').bind('agent-expiry').first<{ cursor: string | null }>();
  const page = await files.list({ prefix: 'agent/', cursor: cursor?.cursor || undefined, limit: 50 });
  for (const object of page.objects) {
    const job = await prisma.certificateJob.findUnique({ where: { id: object.key.split('/')[1] } });
    if (!job || job.status === 'expired' || job.expiresAt <= new Date()) {
      if (job || Date.now() - object.uploaded.getTime() > DAY) await files.delete(object.key);
      continue;
    }
    if (Date.now() - object.uploaded.getTime() <= LEASE || object.key.split('/')[2] === job.attemptToken) continue;
    const state = checkpoint(job);
    const manifest = job.manifest as unknown as Manifest | null;
    const referenced = [state.requestKey, state.templateKey, state.sampleKey, manifest?.zip.objectKey, ...state.files.map(file => file.objectKey)];
    if (!referenced.includes(object.key)) await files.delete(object.key);
  }
  await db.prepare(`INSERT INTO MaintenanceCursor(id,cursor) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor`)
    .bind('agent-expiry', page.truncated ? page.cursor : null).run();
}
