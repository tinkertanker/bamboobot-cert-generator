import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'crypto';
import { cloudflare } from '@/lib/server/cloudflare';
import { PdfQueueManager } from '@/lib/pdf/pdf-queue';
import type { PdfQueue } from '@/lib/pdf/types';
import { MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER } from '@/lib/pdf/server-limits';
import { readAuthorizedTemplate } from '@/lib/security/private-file-access';
import { renderSinglePdf, type Entry, type Position } from '@/lib/pdf-generator';
import { uploadToR2 } from '@/lib/r2-client';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

const ACTIVE_TTL_MS = 24 * 60 * 60 * 1000;
const FINISHED_TTL_MS = 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;

interface StoredJob {
  id: string;
  ownerId: string;
  payload: string;
}

export async function createWorkerPdfJob(ownerId: string, manager: PdfQueueManager): Promise<boolean> {
  const now = Date.now();
  const queue = manager.getQueue();
  // Admission and insertion are one statement: concurrent isolates cannot each
  // observe a spare slot and exceed the account's active-job limit.
  const inserted = await cloudflare().env.DB.prepare(`
    INSERT INTO "PdfJob" ("id", "ownerId", "status", "payload", "expiresAt", "updatedAt")
    SELECT ?, ?, ?, ?, ?, ? WHERE (
      SELECT count(*) FROM "PdfJob" WHERE "ownerId" = ?
        AND "status" IN ('idle', 'processing', 'paused') AND "expiresAt" > ?
    ) < ? RETURNING "id"
  `).bind(queue.sessionId, ownerId, queue.status, JSON.stringify(queue), now + ACTIVE_TTL_MS,
    now, ownerId, now, MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER).first();
  return !!inserted;
}

export async function getWorkerPdfProgress(ownerId: string, sessionId: string) {
  const row = await cloudflare().env.DB.prepare(`
    SELECT "payload" FROM "PdfJob" WHERE "id" = ? AND "ownerId" = ? AND "expiresAt" > ?
  `).bind(sessionId, ownerId, Date.now()).first<{ payload: string }>();
  if (!row) return null;
  const manager = PdfQueueManager.restore(JSON.parse(row.payload) as PdfQueue);
  const progress = manager.getProgress();
  return progress.status === 'completed' || progress.status === 'error'
    ? { ...progress, results: manager.getResults() }
    : progress;
}

export async function controlWorkerPdfJob(ownerId: string, sessionId: string, action: string) {
  const db = cloudflare().env.DB;
  const now = Date.now();
  if (action === 'cancel') {
    const result = await db.prepare('DELETE FROM "PdfJob" WHERE "id" = ? AND "ownerId" = ? AND "expiresAt" > ?')
      .bind(sessionId, ownerId, now).run();
    return result.meta.changes ? 'error' : null;
  }
  const before = action === 'pause' ? 'processing' : 'paused';
  const after = action === 'pause' ? 'paused' : 'processing';
  const result = await db.prepare(`
    UPDATE "PdfJob" SET "status" = ?, "payload" = json_set("payload", '$.status', ?),
      "updatedAt" = ?, "expiresAt" = ?
    WHERE "id" = ? AND "ownerId" = ? AND "status" = ? AND "expiresAt" > ? RETURNING "id"
  `).bind(after, after, now, now + ACTIVE_TTL_MS, sessionId, ownerId, before, now).first();
  if (result) return after;
  const exists = await getWorkerPdfProgress(ownerId, sessionId);
  if (!exists) return null;
  throw new Error(action === 'pause' ? 'Queue is not processing' : 'Queue is not paused');
}

export async function processWorkerPdfJob(sessionId: string, maxDurationMs = 20_000): Promise<void> {
  const db = cloudflare().env.DB;
  const now = Date.now();
  const leaseToken = randomUUID();
  const row = await db.prepare(`
    UPDATE "PdfJob" SET "leaseToken" = ?, "leaseUntil" = ?
    WHERE "id" = ? AND "status" = 'processing' AND "leaseUntil" <= ? AND "expiresAt" > ?
    RETURNING "id", "ownerId", "payload"
  `).bind(leaseToken, now + LEASE_MS, sessionId, now, now).first<StoredJob>();
  if (!row) return;

  const manager = PdfQueueManager.restore(JSON.parse(row.payload) as PdfQueue);
  const queue = manager.getQueue();
  let template: Promise<PDFDocument> | undefined;
  await manager.processNextBatch(async item => {
    // A deterministic key makes replay after a crash safe: a PDF can be
    // regenerated, but progress is committed only by the current lease holder.
    const relativePath = `u_${row.ownerId}/progressive_${sessionId}/${item.filename}`;
    template ??= (async () => {
      const bytes = await readAuthorizedTemplate(queue.templateFile, row.ownerId);
      if (!bytes) throw new Error('Template not found');
      return PDFDocument.load(bytes);
    })();
    if (queue.mode !== 'individual') throw new Error('Bulk progressive mode not yet implemented');
    const bytes = await renderSinglePdf(await template, item.data as Entry,
      queue.positions as Record<string, Position>, queue.uiContainerDimensions);
    await uploadToR2(Buffer.from(bytes), `generated/${relativePath}`, 'application/pdf', item.filename);
    return { filename: item.filename, path: createSignedGeneratedFileUrl(relativePath) };
  }, maxDurationMs);

  const finished = queue.status === 'completed' || queue.status === 'error';
  // Preserve concurrent pause/resume controls while committing finished items.
  // Cancellation deletes the row, and lease fencing prevents stale commits.
  await db.prepare(`
    UPDATE "PdfJob" SET
      "payload" = json_set(?, '$.status', CASE WHEN "status" = 'paused' THEN 'paused' ELSE ? END),
      "status" = CASE WHEN "status" = 'paused' THEN 'paused' ELSE ? END,
      "leaseToken" = NULL, "leaseUntil" = 0, "updatedAt" = ?, "expiresAt" = ?
    WHERE "id" = ? AND "leaseToken" = ?
  `).bind(JSON.stringify(queue), queue.status, queue.status, Date.now(),
    Date.now() + (finished ? FINISHED_TTL_MS : ACTIVE_TTL_MS), sessionId, leaseToken).run();
}

// Cron, not an isolate-local timer, is the eventual-progress guarantee.
export async function recoverWorkerPdfJobs(): Promise<void> {
  const db = cloudflare().env.DB;
  const now = Date.now();
  // One budget for the entire invocation, not 20 seconds per queued job.
  // Wall time also bounds CPU time, except for the last indivisible render;
  // remote profiling must establish headroom for that render before cutover.
  const deadline = now + 20_000;
  await db.prepare('DELETE FROM "PdfJob" WHERE "expiresAt" <= ?').bind(now).run();
  await db.prepare('DELETE FROM "RateLimit" WHERE "resetAt" <= ?').bind(now).run();
  // Serial batches bound template/font memory. Re-selecting the oldest job
  // after each checkpoint shares capacity across accounts rather than draining
  // every job in a snapshot before checking the invocation's budget.
  for (let batch = 0; batch < 10 && Date.now() < deadline; batch++) {
    const ready = await db.prepare(`
      SELECT "id" FROM "PdfJob" WHERE "status" = 'processing' AND "leaseUntil" <= ?
        AND "expiresAt" > ? ORDER BY "updatedAt" LIMIT 1
    `).bind(Date.now(), Date.now()).first<{ id: string }>();
    if (!ready || Date.now() >= deadline) return;
    await processWorkerPdfJob(ready.id, deadline - Date.now());
  }
}
