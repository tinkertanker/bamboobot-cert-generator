/** @jest-environment node */
import { readFileSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import prisma from '@/lib/server/prisma';
import { createWorkerDraft, approveWorkerJob, processWorkerCertificateJobs, expireWorkerJob, type WorkerCheckpoint } from '@/lib/agent/worker-jobs';
import { digest } from '@/lib/agent/render';
import type { Snapshot, Manifest } from '@/lib/agent/jobs';

let context: any;
jest.mock('@/lib/server/cloudflare', () => ({ cloudflare: () => context, isWorkers: true }));

describe('certificate contract with real D1 and R2', () => {
  let mf: any;
  let db: any;
  let bucket: any;
  const payload = (count = 4) => ({ label: 'Asymmetric recipients',
    rows: Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, fields: { name: ['Ada Lovelace', 'Grace Murray Hopper', 'Alan Turing', 'Katherine Johnson'][i % 4] } })),
    positions: { name: { x: 50, y: 46, width: 70, fontSize: 32, alignment: 'center', fontFamily: 'Poppins' } },
  });
  beforeAll(async () => {
    process.env.AGENT_CERTIFICATES_ENABLED = 'true';
    const { Miniflare } = require('miniflare');
    mf = new Miniflare({ workers: [{ config: {
      name: 'certificate-contract', compatibilityDate: '2026-10-19',
      manifest: { mainModule: 'index.js', modules: { 'index.js': {
        type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
      } } },
      env: { DB: { type: 'd1', id: 'certificate-contract' }, FILES: { type: 'r2', name: 'certificate-contract' } },
    }, dev: { unsafeRegisterWorker: false } }] });
    db = await mf.getD1Database('DB', 'certificate-contract');
    bucket = await mf.getR2Bucket('FILES', 'certificate-contract');
    context = { env: { DB: db, FILES: bucket, ASSETS: {
      fetch: async (request: Request) => new Response(new URL(request.url).pathname === '/agent-renderer-version.json'
        ? JSON.stringify('a'.repeat(64)) : readFileSync(`public${new URL(request.url).pathname}`)),
    } } };
    for (const file of ['0001_initial.sql', '0005_maintenance.sql', '0006_agent_certificates.sql']) {
      let statement = '';
      for (const line of readFileSync(`prisma/d1-migrations/${file}`, 'utf8').split('\n')) {
        if (!line.trim() || line.trim().startsWith('--')) continue;
        statement += `${line}\n`;
        if (statement.trim().startsWith('CREATE TRIGGER') ? line.trim() === 'END;' : line.trim().endsWith(';')) {
          await db.prepare(statement).run(); statement = '';
        }
      }
    }
    await db.prepare(`INSERT INTO User(id,tier,lastUsageReset) VALUES ('owner','free',?)`).bind(new Date().toISOString()).run();
  });
  afterAll(async () => { await prisma.$disconnect(); await mf?.dispose(); });
  beforeEach(async () => {
    await db.prepare('DELETE FROM CertificateJob').run();
    await db.prepare('UPDATE User SET dailyPdfCount=0,lifetimePdfCount=0').run();
  });
  const job = (id: string) => prisma.certificateJob.findUniqueOrThrow({ where: { id } });
  async function prepare(id: string) {
    for (let i = 0; i < 20 && (await job(id)).status === 'preparing'; i++) await processWorkerCertificateJobs(0);
    expect((await job(id)).status).toBe('awaiting_approval');
  }

  it('checkpoints every row, charges concurrent approval once, and publishes identical PDFs and ZIP entries', async () => {
    const { job: draft } = await createWorkerDraft('owner', payload(), 'exact-bytes');
    expect(draft.status).toBe('preparing');
    await Promise.all([processWorkerCertificateJobs(0), processWorkerCertificateJobs(0)]);
    expect((await job(draft.id)).progress).toBeGreaterThan(0);
    expect((await job(draft.id)).approvedAt).toBeNull();
    await prepare(draft.id);
    const ready = await job(draft.id);
    const state = ready.checkpoint as unknown as WorkerCheckpoint;
    const input = ready.input as unknown as Snapshot;
    expect(input.samples).toEqual([0, 1, 3]);
    expect((await PDFDocument.load(await (await bucket.get(state.sampleKey)).arrayBuffer())).getPageCount()).toBe(3);
    await Promise.all([approveWorkerJob('owner', draft.id, draft.inputHash), approveWorkerJob('owner', draft.id, draft.inputHash)]);
    expect(await db.prepare('SELECT dailyPdfCount,lifetimePdfCount FROM User').first()).toEqual({ dailyPdfCount: 1, lifetimePdfCount: 1 });
    await processWorkerCertificateJobs();
    const complete = await job(draft.id);
    expect(complete.status).toBe('completed');
    const manifest = complete.manifest as unknown as Manifest;
    const zipBytes = Buffer.from(await (await bucket.get(manifest.zip.objectKey)).arrayBuffer());
    expect(digest(zipBytes)).toBe(manifest.zip.sha256);
    const zip = await JSZip.loadAsync(zipBytes);
    expect(Object.keys(zip.files).sort()).toEqual([...input.filenames, 'manifest.json'].sort());
    for (let i = 0; i < manifest.files.length; i++) {
      const file = manifest.files[i];
      const output = Buffer.from(await (await bucket.get(file.objectKey)).arrayBuffer());
      expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
      expect(digest(output)).toBe(file.sha256);
      expect(await zip.file(file.filename)!.async('nodebuffer')).toEqual(output);
      if (input.samples.includes(i)) expect(digest(output)).toBe(input.sampleHashes[input.samples.indexOf(i)]);
    }
  }, 30000);

  it('does not queue or partially charge an approval beyond quota, and still replays a prior approval', async () => {
    const { job: draft } = await createWorkerDraft('owner', payload(1), 'quota-boundary');
    await prepare(draft.id);
    await db.prepare('UPDATE User SET dailyPdfCount=10,lifetimePdfCount=20').run();
    await expect(approveWorkerJob('owner', draft.id, draft.inputHash)).rejects.toMatchObject({ status: 403 });
    expect((await job(draft.id)).status).toBe('awaiting_approval');
    expect(await db.prepare('SELECT dailyPdfCount,lifetimePdfCount FROM User').first()).toEqual({ dailyPdfCount: 10, lifetimePdfCount: 20 });
    await db.prepare('UPDATE User SET dailyPdfCount=9').run();
    await approveWorkerJob('owner', draft.id, draft.inputHash);
    await approveWorkerJob('owner', draft.id, draft.inputHash);
    expect(await db.prepare('SELECT dailyPdfCount,lifetimePdfCount FROM User').first()).toEqual({ dailyPdfCount: 10, lifetimePdfCount: 21 });
  });

  it('fails closed when a nonsample object is missing instead of publishing a skip-failed ZIP', async () => {
    const { job: draft } = await createWorkerDraft('owner', payload(), 'missing-object');
    await prepare(draft.id);
    const ready = await job(draft.id);
    await bucket.delete((ready.checkpoint as unknown as WorkerCheckpoint).files[2].objectKey);
    await approveWorkerJob('owner', draft.id, draft.inputHash);
    await processWorkerCertificateJobs();
    const failed = await job(draft.id);
    expect(failed.status).toBe('failed');
    expect(failed.manifest).toBeNull();
    expect(failed.error).toMatch(/missing or changed/);
  }, 15000);

  it('recovers an interrupted lease without browser requests and rejects expired approvals', async () => {
    const { job: draft } = await createWorkerDraft('owner', payload(), 'crash-recovery');
    await processWorkerCertificateJobs(0);
    const before = (await job(draft.id)).progress;
    await db.prepare(`UPDATE CertificateJob SET attemptToken='killed-worker',leaseUntil='2000-01-01T00:00:00Z' WHERE id=?`).bind(draft.id).run();
    await processWorkerCertificateJobs(0);
    expect((await job(draft.id)).progress).toBeGreaterThan(before);
    expect((await job(draft.id)).attempts).toBe(1);
    await prepare(draft.id);
    await db.prepare(`UPDATE CertificateJob SET expiresAt='2000-01-01T00:00:00Z' WHERE id=?`).bind(draft.id).run();
    await expect(approveWorkerJob('owner', draft.id, draft.inputHash)).rejects.toMatchObject({ status: 410 });
    expect(await db.prepare('SELECT dailyPdfCount FROM User').first()).toEqual({ dailyPdfCount: 0 });
  });

  it('reserves capacity atomically, replays input keys, and revokes access immediately on delete', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => createWorkerDraft('owner', payload(1), `admission-${i}`)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    const first = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof createWorkerDraft>>>).value.job;
    expect((await createWorkerDraft('owner', payload(1), first.idempotencyKey)).created).toBe(false);
    await expect(createWorkerDraft('owner', payload(2), first.idempotencyKey)).rejects.toMatchObject({ status: 409 });
    await expireWorkerJob('owner', first.id);
    await expect(createWorkerDraft('owner', payload(1), first.idempotencyKey)).rejects.toMatchObject({ status: 409 });
    expect((await job(first.id)).input).toEqual({});
  });
});
