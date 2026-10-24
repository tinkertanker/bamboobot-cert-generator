import crypto from 'crypto';
import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { finished } from 'stream/promises';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import type { CertificateJob, Prisma } from '@prisma/client';
import prisma from '@/lib/server/prisma';
import { getGeneratedDir } from '@/lib/paths';
import { getTierLimits, type UserTier } from '@/types/user';
import { resetDailyUsageIfNeeded } from '@/lib/server/tiers';
import { AgentError, validateAgentInput, type AgentInput } from './input';
import { digest, makeTemplate, rendererVersion, renderRow } from './render';
import { logAgentError } from './log';

const DAY = 86400000;
const MAX_BYTES = 250 * 1024 * 1024;
const LEASE_MS = 5 * 60_000;
// v1 deploys one web process: bound decoding/rendering before allocating inputs.
// Multiple web processes require a persisted preparation reservation instead.
let preparing = false;
interface Snapshot extends AgentInput {
  templateHash: string;
  filenames: string[];
  samples: number[];
  sampleHashes: string[];
}
export interface Artifact { filename: string; size: number; sha256: string; rowId?: string }
export interface Manifest {
  jobId: string; inputHash: string; rendererVersion: string; total: number;
  files: Artifact[]; zip: Artifact; attempt: string; expiresAt: string;
}
export const jobDir = (id: string) => path.join(getGeneratedDir(), 'agent_jobs', id);
const json = (value: unknown) => value as Prisma.InputJsonValue;
const snapshot = (job: CertificateJob) => job.input as unknown as Snapshot;

async function fileDigest(file: string) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export async function ownedJob(ownerId: string, id: string) {
  const job = await prisma.certificateJob.findFirst({ where: { id, ownerId } });
  if (!job) throw new AgentError('Job not found', 404);
  if (job.expiresAt <= new Date() || job.status === 'expired') throw new AgentError('Job has expired', 410);
  return job;
}

export function describeJob(job: CertificateJob) {
  const input = snapshot(job);
  const base = `/api/agent/jobs/${job.id}`;
  const manifest = job.status === 'completed' ? job.manifest as unknown as Manifest : null;
  return {
    id: job.id, label: job.label, status: job.status, total: job.total, progress: job.progress,
    inputHash: job.inputHash, createdAt: job.createdAt, expiresAt: job.expiresAt,
    approvedAt: job.approvedAt, error: job.error, attempts: job.attempts,
    fields: Object.keys(input.positions ?? {}),
    ignoredFields: [...new Set((input.rows ?? []).flatMap(r => Object.keys(r.fields)))].filter(k => !input.positions?.[k]),
    sampleRowIds: input.samples?.map(i => input.rows[i].id) ?? [],
    sampleUrl: `${base}?artifact=sample`, inputUrl: `${base}?artifact=input`, approvalUrl: `/agent?job=${job.id}`,
    files: manifest?.files.map((file, index) => ({ ...file, url: `${base}?artifact=file&index=${index}` })) ?? [],
    zipUrl: manifest ? `${base}?artifact=zip` : null,
    manifestUrl: manifest ? `${base}?artifact=manifest` : null,
  };
}

export async function createDraft(ownerId: string, value: unknown, idempotencyKey: string) {
  if (preparing) throw new AgentError('Another draft is being prepared; retry shortly', 429);
  preparing = true;
  try { return await prepareDraft(ownerId, value, idempotencyKey); }
  finally { preparing = false; }
}

async function prepareDraft(ownerId: string, value: unknown, idempotencyKey: string) {
  if (!/^[\w-]{1,100}$/.test(idempotencyKey)) throw new AgentError('Supply an Idempotency-Key header (1–100 letters, digits, underscores or hyphens)');
  const input = validateAgentInput(value);
  if (Buffer.byteLength(JSON.stringify(input)) > 1024 * 1024) throw new AgentError('Recipient/layout JSON exceeds 1 MB', 413);
  const templateOption = (value as { template?: { base64?: unknown } }).template;
  if (templateOption !== undefined && (!templateOption || typeof templateOption !== 'object' || typeof templateOption.base64 !== 'string')) throw new AgentError('Supply template.base64 or omit template for the default');
  const version = await rendererVersion();
  // PDF metadata contains creation timestamps. Hash the source for idempotency;
  // the actual immutable PDF bytes are separately verified before rendering.
  const requestHash = digest(JSON.stringify({ input, template: templateOption?.base64 ?? 'default-v1', version }));
  const existing = await prisma.certificateJob.findUnique({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } } });
  if (existing) {
    if (existing.status === 'expired' || existing.expiresAt <= new Date()) throw new AgentError('Job has expired; choose a new idempotency key', 409);
    if (existing.inputHash !== requestHash) throw new AgentError('Idempotency key already belongs to different inputs', 409);
    return { job: await ownedJob(ownerId, existing.id), created: false };
  }
  const active = await prisma.certificateJob.count({ where: { ownerId, status: { in: ['awaiting_approval', 'queued', 'running'] } } });
  if (active >= 3) throw new AgentError('At most three pending jobs are allowed', 429);
  const usage = await prisma.certificateJob.aggregate({ _sum: { storageBytes: true }, where: { status: { not: 'expired' } } });
  if ((usage._sum.storageBytes ?? 0) > 2 * 1024 * 1024 * 1024) throw new AgentError('Agent artifact storage is full; delete old jobs', 507);
  const templateBytes = await makeTemplate(templateOption?.base64);
  const templateHash = digest(templateBytes);
  const template = await PDFDocument.load(templateBytes);
  const longest = input.rows.reduce((best, row, i) => Object.keys(input.positions).reduce((n, k) => n + row.fields[k].length, 0) > Object.keys(input.positions).reduce((n, k) => n + input.rows[best].fields[k].length, 0) ? i : best, 0);
  const samples = [...new Set([0, longest, input.rows.length - 1])];
  const filenames = input.rows.map((row, index) => `${String(index + 1).padStart(4, '0')}-${row.id.slice(0, 50)}.pdf`);
  const id = crypto.randomUUID();
  const dir = jobDir(id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(path.join(dir, 'template.pdf'), templateBytes);
    const sample = await PDFDocument.create();
    const sampleHashes: string[] = [];
    let estimatedBytes = 0;
    const started = Date.now();
    // Preflight EVERY row through the real strict renderer, not an AI estimate.
    // Discard non-samples immediately rather than retaining an entire batch.
    for (let index = 0; index < input.rows.length; index++) {
      let bytes: Uint8Array;
      try { bytes = await renderRow(template, input, index); }
      catch { throw new AgentError(`Recipient ${index + 1} has unsupported glyphs, an unavailable font or text that does not fit; revise the layout`); }
      estimatedBytes += bytes.length;
      if (estimatedBytes > MAX_BYTES) throw new AgentError('Individual PDFs would exceed the 250 MB batch limit', 413);
      if (Date.now() - started > 60_000) throw new AgentError('Preflight exceeded one minute; reduce the batch or simplify the template', 413);
      if (samples.includes(index)) {
        await fs.writeFile(path.join(dir, `sample-${index}.pdf`), bytes);
        sampleHashes[samples.indexOf(index)] = digest(bytes);
        const doc = await PDFDocument.load(bytes);
        sample.addPage((await sample.copyPages(doc, [0]))[0]);
      }
    }
    const sampleBytes = await sample.save();
    await fs.writeFile(path.join(dir, 'sample.pdf'), sampleBytes);
    const frozen: Snapshot = { ...input, templateHash, filenames, samples, sampleHashes };
    try {
      const job = await prisma.$transaction(async tx => {
        const pending = { status: { in: ['awaiting_approval', 'queued', 'running'] } };
        if (await tx.certificateJob.count({ where: { ...pending, ownerId } }) >= 3 || await tx.certificateJob.count({ where: pending }) >= 8) throw new AgentError('Pending job capacity reached', 429);
        const reservedBytes = 2 * estimatedBytes + templateBytes.length + 2 * sampleBytes.length;
        const used = await tx.certificateJob.aggregate({ _sum: { storageBytes: true } });
        if ((used._sum.storageBytes ?? 0) + reservedBytes > 2 * 1024 * 1024 * 1024) throw new AgentError('Agent artifact storage capacity reached', 507);
        return tx.certificateJob.create({ data: { id, ownerId, label: input.label, idempotencyKey, inputHash: requestHash, rendererVersion: version, input: json(frozen), sampleHash: digest(sampleBytes), total: input.rows.length, expiresAt: new Date(Date.now() + DAY), storageBytes: reservedBytes } });
      });
      return { job, created: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        const prior = await prisma.certificateJob.findUniqueOrThrow({ where: { ownerId_idempotencyKey: { ownerId, idempotencyKey } } });
        if (prior.inputHash !== requestHash) throw new AgentError('Idempotency key already belongs to different inputs', 409);
        await fs.rm(dir, { recursive: true, force: true });
        return { job: await ownedJob(ownerId, prior.id), created: false };
      }
      throw e;
    }
  } catch (e) { await fs.rm(dir, { recursive: true, force: true }); throw e; }
}

export async function approveJob(ownerId: string, id: string, inputHash: unknown) {
  const job = await ownedJob(ownerId, id);
  if (inputHash !== job.inputHash) throw new AgentError('The preview revision has changed; review the new sample', 409);
  if (job.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; create and approve a new draft', 409);
  if (digest(await fs.readFile(path.join(jobDir(id), 'sample.pdf'))) !== job.sampleHash) throw new AgentError('Sample integrity check failed', 409);
  await resetDailyUsageIfNeeded(ownerId);
  await prisma.$transaction(async tx => {
    const changed = await tx.certificateJob.updateMany({ where: { id, ownerId, status: 'awaiting_approval', inputHash: job.inputHash, expiresAt: { gt: new Date() } }, data: { status: 'queued', approvedAt: new Date(), expiresAt: new Date(Date.now() + 7 * DAY) } });
    if (!changed.count) return; // Duplicate approval neither queues nor charges twice.
    const user = await tx.user.findUniqueOrThrow({ where: { id: ownerId } });
    const limit = getTierLimits(user.tier as UserTier).dailyPdfLimit;
    const charged = await tx.user.updateMany({ where: { id: ownerId, ...(limit === null ? {} : { dailyPdfCount: { lt: limit } }) }, data: { dailyPdfCount: { increment: 1 }, lifetimePdfCount: { increment: 1 } } });
    if (!charged.count) throw new AgentError('Daily PDF batch quota reached', 403);
  });
  return ownedJob(ownerId, id);
}

export async function retryJob(ownerId: string, id: string) {
  const job = await ownedJob(ownerId, id);
  if (!job.approvedAt || job.status !== 'failed' || job.attempts >= 3) throw new AgentError('This job cannot be retried; create a new draft', 409);
  if (job.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; a new sample approval is required', 409);
  await prisma.certificateJob.updateMany({ where: { id, ownerId, status: 'failed', attempts: { lt: 3 } }, data: { status: 'queued', error: null, retryAt: null } });
  return ownedJob(ownerId, id);
}

export async function expireJob(ownerId: string, id: string) {
  await ownedJob(ownerId, id);
  await prisma.certificateJob.update({ where: { id }, data: { status: 'expired', input: {}, manifest: {}, attemptToken: null, expiresAt: new Date(), storageBytes: 0 } });
  await fs.rm(jobDir(id), { recursive: true, force: true });
}

export async function cleanupJobs() {
  const expired = await prisma.certificateJob.findMany({ where: { expiresAt: { lte: new Date() }, status: { not: 'expired' } }, select: { id: true } });
  for (const { id } of expired) {
    const removed = await prisma.certificateJob.updateMany({ where: { id, expiresAt: { lte: new Date() }, status: { not: 'expired' } }, data: { status: 'expired', input: {}, manifest: {}, attemptToken: null, storageBytes: 0 } });
    if (removed.count) await fs.rm(jobDir(id), { recursive: true, force: true });
  }
  // Remove abandoned draft/attempt directories only after their lease window.
  const root = path.join(getGeneratedDir(), 'agent_jobs');
  for (const id of await fs.readdir(root).catch(() => [] as string[])) {
    const dir = jobDir(id);
    const job = await prisma.certificateJob.findUnique({ where: { id } });
    if (!job) {
      if (Date.now() - (await fs.stat(dir)).mtimeMs > LEASE_MS) await fs.rm(dir, { recursive: true, force: true });
      continue;
    }
    // Retry physical cleanup after a failed removal without rewriting tombstones.
    if (job.status === 'expired') { await fs.rm(dir, { recursive: true, force: true }); continue; }
    const published = (job.manifest as unknown as Manifest | null)?.attempt;
    for (const attempt of (await fs.readdir(dir)).filter(name => name.startsWith('attempt-'))) {
      if (attempt === published || attempt === `attempt-${job.attemptToken}`) continue;
      const attemptDir = path.join(dir, attempt);
      if (Date.now() - (await fs.stat(attemptDir)).mtimeMs > LEASE_MS) await fs.rm(attemptDir, { recursive: true, force: true });
    }
  }
}

async function makeZip(dir: string, files: Artifact[], manifest: Omit<Manifest, 'zip'>) {
  const output = createWriteStream(path.join(dir, 'certificates.zip'), { flags: 'wx' });
  const archive = archiver('zip', { zlib: { level: 6 } });
  const abort = (e: Error) => { archive.abort(); output.destroy(e); };
  archive.on('error', abort);
  archive.on('warning', abort);
  output.on('error', () => archive.abort());
  const closed = finished(output);
  // Attach rejection before starting any asynchronous archive work.
  closed.catch(() => undefined);
  archive.pipe(output);
  try {
    for (let i = 0; i < files.length; i++) {
      const file = path.join(dir, `${i}.pdf`);
      if (await fileDigest(file) !== files[i].sha256) throw new Error('Artifact verification failed');
      archive.file(file, { name: files[i].filename });
    }
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    await Promise.all([archive.finalize(), closed]);
  } catch (e) { abort(e instanceof Error ? e : new Error('ZIP creation failed')); await closed.catch(() => undefined); throw e; }
}

export async function runOneJob(): Promise<boolean> {
  const now = new Date();
  const candidate = await prisma.certificateJob.findFirst({ where: { approvedAt: { not: null }, expiresAt: { gt: now }, OR: [{ status: 'queued', OR: [{ retryAt: null }, { retryAt: { lte: now } }] }, { status: 'running', leaseUntil: { lte: now } }] }, orderBy: { createdAt: 'asc' } });
  if (!candidate) return false;
  const eligible = { id: candidate.id, status: candidate.status, attemptToken: candidate.attemptToken, attempts: candidate.attempts, expiresAt: { gt: now }, ...(candidate.status === 'running' ? { leaseUntil: { lte: now } } : { OR: [{ retryAt: null }, { retryAt: { lte: now } }] }) };
  if (candidate.attempts >= 3) {
    await prisma.certificateJob.updateMany({ where: eligible, data: { status: 'failed', error: 'Worker stopped repeatedly; retry budget exhausted', attemptToken: null } });
    return true;
  }
  const token = crypto.randomUUID();
  const claimed = await prisma.certificateJob.updateMany({ where: eligible, data: { status: 'running', attemptToken: token, attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + LEASE_MS), progress: 0, error: null } });
  if (!claimed.count) return true;
  const attempt = `attempt-${token}`;
  const dir = path.join(jobDir(candidate.id), attempt);
  const input = snapshot(candidate);
  const started = Date.now();
  const fence = async (progress: number) => {
    const current = await prisma.certificateJob.updateMany({ where: { id: candidate.id, status: 'running', attemptToken: token, expiresAt: { gt: new Date() } }, data: { progress, leaseUntil: new Date(Date.now() + LEASE_MS) } });
    if (!current.count) throw new AgentError('Job cancelled or attempt superseded', 409);
    if (Date.now() - started > 10 * 60_000) throw new AgentError('Job exceeded ten minutes');
  };
  try {
    if (candidate.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed; create and approve a new draft');
    const templateBytes = await fs.readFile(path.join(jobDir(candidate.id), 'template.pdf'));
    if (digest(templateBytes) !== input.templateHash) throw new AgentError('Template integrity check failed');
    const template = await PDFDocument.load(templateBytes);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const disk = await fs.statfs(dir);
    if (disk.bavail * disk.bsize < 2 * MAX_BYTES) throw new AgentError('Insufficient disk space for PDF and ZIP artifacts', 507);
    const files: Artifact[] = [];
    let totalBytes = 0;
    for (let i = 0; i < input.rows.length; i++) {
      await fence(i);
      const sampleIndex = input.samples.indexOf(i);
      const bytes = sampleIndex >= 0 ? await fs.readFile(path.join(jobDir(candidate.id), `sample-${i}.pdf`)) : await renderRow(template, input, i);
      if (sampleIndex >= 0 && digest(bytes) !== input.sampleHashes[sampleIndex]) throw new AgentError('Approved sample integrity check failed');
      totalBytes += bytes.length;
      if (totalBytes > MAX_BYTES) throw new AgentError('Batch exceeds the 250 MB artifact limit');
      await fs.writeFile(path.join(dir, `${i}.pdf`), bytes, { flag: 'wx' });
      files.push({ rowId: input.rows[i].id, filename: input.filenames[i], size: bytes.length, sha256: digest(bytes) });
      await new Promise(resolve => setImmediate(resolve));
    }
    const partial = { jobId: candidate.id, inputHash: candidate.inputHash, rendererVersion: candidate.rendererVersion, total: files.length, files, attempt, expiresAt: candidate.expiresAt.toISOString() };
    await makeZip(dir, files, partial);
    const zipPath = path.join(dir, 'certificates.zip');
    const zipSize = (await fs.stat(zipPath)).size;
    if (zipSize > MAX_BYTES) throw new AgentError('ZIP exceeds the 250 MB artifact limit');
    const manifest: Manifest = { ...partial, zip: { filename: 'certificates.zip', size: zipSize, sha256: await fileDigest(zipPath) } };
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await fence(files.length);
    if (candidate.rendererVersion !== await rendererVersion()) throw new AgentError('Renderer changed during generation; new approval required');
    const inputBytes = templateBytes.length + (await fs.stat(path.join(jobDir(candidate.id), 'sample.pdf'))).size + input.samples.reduce((sum, i) => sum + files[i].size, 0);
    await prisma.certificateJob.updateMany({ where: { id: candidate.id, status: 'running', attemptToken: token }, data: { status: 'completed', manifest: json(manifest), storageBytes: totalBytes + zipSize + inputBytes, leaseUntil: null, attemptToken: null } });
  } catch (e) {
    const terminal = e instanceof AgentError || candidate.attempts + 1 >= 3;
    if (!(e instanceof AgentError)) logAgentError('Agent batch attempt failed', e);
    // Retain output if the final DB operation succeeded but its response failed.
    const current = await prisma.certificateJob.findUnique({ where: { id: candidate.id } });
    if ((current?.manifest as unknown as Manifest | null)?.attempt !== attempt) {
      await prisma.certificateJob.updateMany({ where: { id: candidate.id, status: 'running', attemptToken: token }, data: { status: terminal ? 'failed' : 'queued', error: e instanceof AgentError ? e.message : 'Storage or rendering failed; retrying within the attempt budget', retryAt: new Date(Date.now() + 5000), leaseUntil: null, attemptToken: null } });
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return true;
}
