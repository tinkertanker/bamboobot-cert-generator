/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync, spawn } from 'child_process';
import type { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import prisma from '@/lib/server/prisma';
import keys from '@/pages/api/agent/keys';
import jobs from '@/pages/api/agent/jobs/index';
import detail from '@/pages/api/agent/jobs/[id]';
import { cleanupJobs, jobDir, runOneJob } from '@/lib/agent/jobs';
import { digest } from '@/lib/agent/render';

jest.mock('@/lib/rate-limit', () => {
  process.env.RATE_LIMIT_GENERATE_PER_MIN = '1000';
  return jest.requireActual('@/lib/rate-limit');
});
jest.mock('next-auth/next', () => ({
  __esModule: true,
  default: jest.fn(),
  getServerSession: jest.fn(async (req: NextApiRequest) => req.headers['x-test-owner'] ? { user: { id: req.headers['x-test-owner'] } } : null),
}));

let root: string;
let server: http.Server;
let port: number;
const owner = { 'x-test-owner': 'owner' };
const payload = (count = 4) => ({
  label: 'Asymmetric recipients',
  rows: Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, fields: { name: ['Ada Lovelace', 'Grace Murray Hopper', 'alan turing', 'Katherine Johnson'][i % 4] } })),
  positions: { name: { x: 50, y: 46, width: 70, fontSize: 32, alignment: 'center' } },
});

async function call(url: string, method = 'GET', headers: Record<string, string> = {}, body?: unknown): Promise<{ status: number; bytes: Buffer; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', path: url, method, headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', b => chunks.push(b));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let data; try { data = JSON.parse(bytes.toString()); } catch { data = null; }
        resolve({ status: res.statusCode!, bytes, data });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-contract-'));
  process.env.DATABASE_URL = `file:${root}/database.db`;
  process.env.LOCAL_STORAGE_DIR = path.join(root, 'storage');
  process.env.AGENT_CERTIFICATES_ENABLED = 'true';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  process.env.RATE_LIMIT_GENERATE_PER_MIN = '1000';
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' });
  await prisma.user.createMany({ data: [{ id: 'owner', tier: 'plus' }, { id: 'other', tier: 'plus' }] });
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const req = request as NextApiRequest;
    const raw = Buffer.concat(chunks).toString();
    req.body = raw ? JSON.parse(raw) : undefined;
    req.query = Object.fromEntries(url.searchParams);
    const res = response as NextApiResponse;
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
    if (url.pathname === '/keys') await keys(req, res);
    else if (url.pathname === '/jobs') await jobs(req, res);
    else { req.query.id = url.pathname.slice(6); await detail(req, res); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
}, 30000);

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect();
  await fs.rm(root, { recursive: true, force: true });
});

it('requires owner approval, then delivers every individual PDF and identical ZIP entries', async () => {
  const created = await call('/keys', 'POST', owner, { label: 'Agent', scopes: ['certificates:read', 'certificates:write'] });
  expect(created.status).toBe(201);
  const token = { authorization: `Bearer ${created.data.token}` };
  expect(JSON.stringify((await call('/keys', 'GET', owner)).data)).not.toContain(created.data.token);
  const draft = await call('/jobs', 'POST', { ...token, 'idempotency-key': 'batch-a' }, payload());
  expect(draft.status).toBe(201);
  const job = draft.data.job;
  const url = `/jobs/${job.id}`;
  const inputDownload = await call(url + '?artifact=input', 'GET', owner);
  expect(inputDownload.status).toBe(200);
  expect(inputDownload.data.inputHash).toBe(job.inputHash);
  expect(inputDownload.data.input.rows).toEqual(payload().rows);
  expect(inputDownload.data.input.positions).toEqual(payload().positions);
  expect((await call(url + '?artifact=input', 'GET', { 'x-test-owner': 'other' })).status).toBe(404);
  expect((await call(url, 'POST', token, { action: 'approve', inputHash: job.inputHash })).status).toBe(403);
  expect((await call(url, 'POST', { 'x-test-owner': 'other' }, { action: 'approve', inputHash: job.inputHash })).status).toBe(404);
  expect((await call(url, 'POST', { ...owner, origin: 'https://attacker.test' }, { action: 'approve', inputHash: job.inputHash })).status).toBe(403);
  expect((await call(url + '?artifact=zip', 'GET', token)).status).toBe(409);
  expect(await runOneJob()).toBe(false);
  const readKey = await call('/keys', 'POST', owner, { label: 'Read only', scopes: ['certificates:read'] });
  expect((await call('/jobs', 'POST', { authorization: `Bearer ${readKey.data.token}`, 'idempotency-key': 'read-denied' }, payload())).status).toBe(403);
  const sample = await call(url + '?artifact=sample', 'GET', token);
  expect((await PDFDocument.load(sample.bytes)).getPageCount()).toBeGreaterThan(0);
  expect((await call(url, 'POST', owner, { action: 'approve', inputHash: 'stale' })).status).toBe(409);
  expect((await call(url, 'POST', owner, { action: 'approve', inputHash: job.inputHash })).status).toBe(200);
  await call(url, 'POST', owner, { action: 'approve', inputHash: job.inputHash });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: 'owner' } })).dailyPdfCount).toBe(1);
  await Promise.all([runOneJob(), runOneJob()]);
  const complete = (await call(url, 'GET', token)).data.job;
  expect(complete.status).toBe('completed');
  expect(complete.files).toHaveLength(4);
  const zip = await JSZip.loadAsync((await call(url + '?artifact=zip', 'GET', token)).bytes);
  expect(Object.keys(zip.files).sort()).toEqual([...complete.files.map((f: any) => f.filename), 'manifest.json'].sort());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  expect(manifest.total).toBe(4);
  for (let i = 0; i < complete.files.length; i++) {
    const download = await call(`${url}?artifact=file&index=${i}`, 'GET', token);
    expect(download.status).toBe(200);
    expect((await PDFDocument.load(download.bytes)).getPageCount()).toBe(1);
    expect(digest(download.bytes)).toBe(complete.files[i].sha256);
    expect(await zip.file(complete.files[i].filename)!.async('nodebuffer')).toEqual(download.bytes);
  }
  expect((await call(url + '?artifact=zip', 'GET', { 'x-test-owner': 'other' })).status).toBe(404);
  const replay = await call('/jobs', 'POST', { ...token, 'idempotency-key': 'batch-a' }, payload());
  expect(replay.status).toBe(200);
  expect(replay.data.job.id).toBe(job.id);
  const listing = (await call('/jobs', 'GET', owner)).data.jobs;
  expect(listing.find((item: any) => item.id === job.id)).toMatchObject({ status: 'completed', total: 4 });
  expect(listing.some((item: any) => 'input' in item || 'files' in item || 'manifest' in item)).toBe(false);
  const changed = payload(); changed.rows[0].fields.name = 'New recipient';
  expect((await call('/jobs', 'POST', { ...token, 'idempotency-key': 'batch-a' }, changed)).status).toBe(409);
  const revised = await call('/jobs', 'POST', { ...token, 'idempotency-key': 'batch-b' }, changed);
  expect(revised.data.job.status).toBe('awaiting_approval');
  expect((await call(`/jobs/${revised.data.job.id}`, 'POST', owner, { action: 'approve', inputHash: job.inputHash })).status).toBe(409);
  expect((await call(url, 'PUT', token, changed)).status).toBe(405);
  await call(`/keys?id=${created.data.key.id}`, 'DELETE', owner);
  expect((await call(url + '?artifact=zip', 'GET', token)).status).toBe(401);
  expect((await call(url, 'DELETE', owner)).status).toBe(200);
  expect((await call(url, 'GET', owner)).status).toBe(410);
  const expiredReplay = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'batch-a' }, payload());
  expect(expiredReplay.status).toBe(409);
  expect(expiredReplay.data.error).toMatch(/new idempotency key/i);
}, 30000);

it('recovers an abandoned attempt, refuses template drift and cleans expired inputs', async () => {
  const created = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'recovery' }, payload());
  expect(created.status).toBe(201);
  const job = created.data.job;
  await call(`/jobs/${job.id}`, 'POST', owner, { action: 'approve', inputHash: job.inputHash });
  await prisma.certificateJob.update({ where: { id: job.id }, data: { status: 'running', attempts: 1, attemptToken: 'dead-worker', leaseUntil: new Date(0) } });
  await runOneJob();
  const recovered = (await call(`/jobs/${job.id}`, 'GET', owner)).data.job;
  expect(recovered.status).toBe('completed');
  expect(recovered.attempts).toBe(2);
  const second = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'drift' }, payload(1));
  await call(`/jobs/${second.data.job.id}`, 'POST', owner, { action: 'approve', inputHash: second.data.job.inputHash });
  await fs.writeFile(path.join(jobDir(second.data.job.id), 'template.pdf'), 'tampered');
  await runOneJob();
  const failed = (await call(`/jobs/${second.data.job.id}`, 'GET', owner)).data.job;
  expect(failed.status).toBe('failed');
  expect(failed.files).toEqual([]);
  expect((await call(`/jobs/${second.data.job.id}?artifact=zip`, 'GET', owner)).status).toBe(409);
  await prisma.certificateJob.update({ where: { id: job.id }, data: { expiresAt: new Date(0) } });
  await cleanupJobs();
  expect((await call(`/jobs/${job.id}?artifact=zip`, 'GET', owner)).status).toBe(410);
  await expect(fs.stat(jobDir(job.id))).rejects.toThrow();
}, 30000);

it('fails a partial write without publishing artifacts and retries the logical job once', async () => {
  const draft = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'write-failure' }, payload(4));
  const job = draft.data.job;
  await call(`/jobs/${job.id}`, 'POST', owner, { action: 'approve', inputHash: job.inputHash });
  const realWrite = fs.writeFile;
  const spy = jest.spyOn(fs, 'writeFile').mockImplementation(async (file, ...args) => {
    if (String(file).includes('attempt-') && String(file).endsWith('/1.pdf')) throw Object.assign(new Error('Disk failure'), { code: 'ENOSPC' });
    return realWrite(file, ...args);
  });
  await runOneJob();
  spy.mockRestore();
  expect((await call(`/jobs/${job.id}`, 'GET', owner)).data.job.status).toBe('queued');
  expect((await call(`/jobs/${job.id}?artifact=file&index=0`, 'GET', owner)).status).toBe(409);
  await prisma.certificateJob.update({ where: { id: job.id }, data: { retryAt: new Date(0) } });
  await runOneJob();
  const result = (await call(`/jobs/${job.id}`, 'GET', owner)).data.job;
  expect(result.status).toBe('completed');
  expect(result.files).toHaveLength(4);
  expect(result.attempts).toBe(2);
}, 30000);

it('retains approved inputs when approval extends retention during an expiry scan', async () => {
  const created = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'cleanup-race' }, payload(1));
  const id = created.data.job.id;
  await prisma.certificateJob.update({ where: { id }, data: { expiresAt: new Date(0) } });
  const find = prisma.certificateJob.findMany.bind(prisma.certificateJob);
  const scan = jest.spyOn(prisma.certificateJob, 'findMany').mockImplementationOnce((async (args: any) => {
    const expired = await find(args);
    // A concurrent approval commits after the scan, before cleanup's mutation.
    await prisma.certificateJob.update({ where: { id }, data: { status: 'queued', approvedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) } });
    return expired;
  }) as any);
  try { await cleanupJobs(); } finally { scan.mockRestore(); }
  expect((await call(`/jobs/${id}`, 'GET', owner)).data.job.status).toBe('queued');
  expect((await call(`/jobs/${id}?artifact=sample`, 'GET', owner)).status).toBe(200);
  await runOneJob();
  expect((await call(`/jobs/${id}`, 'GET', owner)).data.job.status).toBe('completed');
}, 30000);

it('does not take a running job whose lease was renewed after selection', async () => {
  const created = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'lease-race' }, payload(1));
  const id = created.data.job.id;
  await call(`/jobs/${id}`, 'POST', owner, { action: 'approve', inputHash: created.data.job.inputHash });
  await prisma.certificateJob.update({ where: { id }, data: { status: 'running', attemptToken: 'live-owner', attempts: 1, leaseUntil: new Date(0) } });
  const find = prisma.certificateJob.findFirst.bind(prisma.certificateJob);
  const selection = jest.spyOn(prisma.certificateJob, 'findFirst').mockImplementationOnce((async (args: any) => {
    const candidate = await find(args);
    await prisma.certificateJob.update({ where: { id }, data: { leaseUntil: new Date(Date.now() + 600000) } });
    return candidate;
  }) as any);
  try { await runOneJob(); } finally { selection.mockRestore(); }
  const current = (await call(`/jobs/${id}`, 'GET', owner)).data.job;
  expect(current.status).toBe('running');
  expect(current.attempts).toBe(1);
  expect((await call(`/jobs/${id}?artifact=zip`, 'GET', owner)).status).toBe(409);
  await call(`/jobs/${id}`, 'DELETE', owner);
}, 30000);

it('bounds concurrent draft preflight before rendering and releases capacity afterwards', async () => {
  const results = await Promise.all(['a', 'b'].map(key => call('/jobs', 'POST', { ...owner, 'idempotency-key': `preflight-${key}` }, payload(4))));
  expect(results.map(r => r.status).sort()).toEqual([201, 429]);
  const created = results.find(r => r.status === 201)!;
  await call(`/jobs/${created.data.job.id}`, 'DELETE', owner);
  const next = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'preflight-after' }, payload(1));
  expect(next.status).toBe(201);
  await call(`/jobs/${next.data.job.id}`, 'DELETE', owner);
}, 30000);

it('rejects unsupported glyphs and descenders clipped at the bottom before approval', async () => {
  const unsupported = payload(1);
  unsupported.rows[0].fields.name = 'Ada 🚀';
  expect((await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'unsupported' }, unsupported)).status).toBe(400);
  const clipped = payload(1);
  clipped.rows[0].fields.name = 'Grace typography';
  clipped.positions.name.y = 98;
  clipped.positions.name.fontSize = 24;
  expect((await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'descender' }, clipped)).status).toBe(400);
}, 30000);

it('accepts multiline spacing but rejects truncation and oversized PNGs before approval', async () => {
  const spaced = payload(1);
  spaced.rows[0].fields.name = 'Ada  Lovelace';
  const body = { ...spaced, positions: { name: { ...spaced.positions.name, textMode: 'multiline' } } };
  const draft = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'multiline-spacing' }, body);
  expect(draft.status).toBe(201);
  expect((await PDFDocument.load((await call(`/jobs/${draft.data.job.id}?artifact=sample`, 'GET', owner)).bytes)).getPageCount()).toBe(1);
  await call(`/jobs/${draft.data.job.id}`, 'DELETE', owner);
  body.rows[0].fields.name = 'A long recipient name '.repeat(40);
  expect((await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'multiline-truncated' }, body)).status).toBe(400);
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(13, 8); png.write('IHDR', 12);
  png.writeUInt32BE(7000, 16); png.writeUInt32BE(7000, 20);
  const rejected = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'png-budget' }, { ...payload(1), template: { base64: png.toString('base64') } });
  expect(rejected.status).toBe(400);
  expect(rejected.data.error).toMatch(/12 megapixel/);
}, 30000);

it('does not enqueue or charge a draft that expires while approval verifies the sample', async () => {
  const created = await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'approval-expiry' }, payload(1));
  const job = created.data.job;
  const before = (await prisma.user.findUniqueOrThrow({ where: { id: 'owner' } })).dailyPdfCount;
  const read = fs.readFile.bind(fs);
  const sampleRead = jest.spyOn(fs, 'readFile').mockImplementation((async (file: any, ...args: any[]) => {
    const bytes = await (read as any)(file, ...args);
    if (String(file) === path.join(jobDir(job.id), 'sample.pdf')) {
      await prisma.certificateJob.update({ where: { id: job.id }, data: { expiresAt: new Date(0) } });
    }
    return bytes;
  }) as any);
  try {
    expect((await call(`/jobs/${job.id}`, 'POST', owner, { action: 'approve', inputHash: job.inputHash })).status).toBe(410);
  } finally { sampleRead.mockRestore(); }
  expect((await prisma.user.findUniqueOrThrow({ where: { id: 'owner' } })).dailyPdfCount).toBe(before);
  await cleanupJobs();
}, 30000);

it('processes approved jobs when an expired directory cannot be cleaned', async () => {
  const expired = (await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'cleanup-unwritable' }, payload(1))).data.job;
  const ready = (await call('/jobs', 'POST', { ...owner, 'idempotency-key': 'cleanup-independent' }, payload(1))).data.job;
  await call(`/jobs/${ready.id}`, 'POST', owner, { action: 'approve', inputHash: ready.inputHash });
  await prisma.certificateJob.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
  await fs.chmod(jobDir(expired.id), 0);
  const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/agent-worker.ts'], { env: process.env, stdio: 'ignore' });
  const stopped = new Promise<void>(resolve => worker.once('exit', () => resolve()));
  try {
    const deadline = Date.now() + 10000;
    let status;
    do {
      await new Promise(resolve => setTimeout(resolve, 100));
      status = (await prisma.certificateJob.findUniqueOrThrow({ where: { id: ready.id } })).status;
    } while (status !== 'completed' && Date.now() < deadline);
    expect(status).toBe('completed');
    expect((await call(`/jobs/${ready.id}?artifact=zip`, 'GET', owner)).status).toBe(200);
  } finally {
    worker.kill('SIGTERM');
    await stopped;
    await fs.chmod(jobDir(expired.id), 0o700);
    await cleanupJobs();
  }
}, 20000);
