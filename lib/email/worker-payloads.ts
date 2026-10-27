import { cloudflare } from '@/lib/server/cloudflare';
import { EmailRequestError } from './abuse-controls';
import { error as logError } from '@/lib/log';

const STAGING_MS = 30 * 60 * 1000;

export function emailPayloadKeys(token: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `mail-payload/v2/${token}/${index}.json`);
}

/** All states count, including expired reservations and failed deletions. */
export async function reserveEmailPayloads(token: string, ownerId: string, jobId: string,
  bodies: string[], policy: Record<string, number>): Promise<void> {
  const db = cloudflare().env.DB;
  const bytes = bodies.reduce((sum, body) => sum + Buffer.byteLength(body), 0);
  const reserved = await db.prepare(`INSERT INTO EmailPayloadReservation(token,ownerId,jobId,bytes,objectCount,state,expiresAt)
    SELECT ?,?,?,?,?,'staging',? WHERE
      (SELECT coalesce(sum(bytes),0) FROM EmailPayloadReservation)+?<=? AND
      (SELECT coalesce(sum(bytes),0) FROM EmailPayloadReservation WHERE ownerId=?)+?<=? AND
      (SELECT coalesce(sum(bytes),0) FROM EmailPayloadReservation WHERE jobId=?)+?<=? AND
      (SELECT count(*) FROM EmailPayloadReservation WHERE state='staging')<? AND
      (SELECT count(*) FROM EmailPayloadReservation WHERE state='staging' AND ownerId=?)<?
    RETURNING token`)
    .bind(token, ownerId, jobId, bytes, bodies.length, Date.now() + STAGING_MS,
      bytes, policy.globalBytes, ownerId, bytes, policy.userBytes, jobId, bytes, policy.queueBytes,
      policy.activeGlobal, ownerId, policy.activePerUser).first();
  if (!reserved) throw new EmailRequestError('Email payload storage or upload capacity reached', 429);
}

export async function putEmailPayloads(token: string, bodies: string[]): Promise<void> {
  const { DB: db, FILES: files } = cloudflare().env;
  // Create each placeholder exactly once. If this response is lost, abandon the
  // upload; never retry creation or overwrite unconditionally with payload bytes.
  const keys = emailPayloadKeys(token, bodies.length);
  const etags = [];
  for (const key of keys) {
    const placeholder = await files.put(key, '', { onlyIf: { etagDoesNotMatch: '*' } });
    if (!placeholder) throw new EmailRequestError('Email payload upload expired', 429);
    etags.push(placeholder.etag);
  }
  // R2 permits one write per second per key. Separate the two write phases,
  // rather than adding a second of latency for every recipient.
  await new Promise(resolve => setTimeout(resolve, 1000));
  const live = await db.prepare(`SELECT token FROM EmailPayloadReservation
    WHERE token=? AND state='staging' AND expiresAt>?`).bind(token, Date.now()).first();
  if (!live) throw new EmailRequestError('Email payload upload expired', 429);
  // R2 evaluates If-Match atomically at commit. Once cleanup deletes the
  // placeholder, a delayed put cannot recreate the payload after quota release.
  for (let index = 0; index < bodies.length; index++) {
    const stored = await files.put(keys[index], bodies[index], { onlyIf: { etagMatches: etags[index] },
      httpMetadata: { contentType: 'application/json' } });
    if (!stored) throw new EmailRequestError('Email payload upload expired', 429);
  }
}

/** Fence admission before touching R2; keep the entire charge on any failure. */
export async function discardEmailPayloads(token: string): Promise<void> {
  const db = cloudflare().env.DB;
  try {
    await db.prepare(`UPDATE EmailPayloadReservation SET state='deleting',expiresAt=? WHERE token=?
      AND NOT EXISTS(SELECT 1 FROM EmailSubmission WHERE token=EmailPayloadReservation.token)`)
      .bind(Date.now(), token).run();
    await deleteEmailPayloads(token);
  } catch {
    // Preserve the original admission/upload result; cron retries this charge.
    logError('Email payload discard failed; reservation retained');
  }
}

async function deleteEmailPayloads(token: string): Promise<void> {
  const { DB: db, FILES: files } = cloudflare().env;
  const row = await db.prepare(`SELECT objectCount FROM EmailPayloadReservation WHERE token=? AND state='deleting'`)
    .bind(token).first<{ objectCount: number }>();
  if (!row) return;
  await files.delete(emailPayloadKeys(token, row.objectCount));
  await db.prepare(`DELETE FROM EmailPayloadReservation WHERE token=? AND state='deleting'`).bind(token).run();
}

/** Bounded, retryable reconciliation, independent of the R2 listing cursor. */
export async function cleanupEmailPayloads(): Promise<void> {
  const db = cloudflare().env.DB;
  const now = Date.now();
  const candidates = await db.prepare(`SELECT token FROM EmailPayloadReservation
    WHERE (state IN ('staging','deleting') AND expiresAt<=?) OR
      (state='admitted' AND NOT EXISTS(SELECT 1 FROM EmailSubmission WHERE token=EmailPayloadReservation.token))
    ORDER BY expiresAt,token LIMIT 10`).bind(now).all<{ token: string }>();
  for (const { token } of candidates.results) {
    try {
      // Compare again inside the write: admission may have committed since SELECT.
      await db.prepare(`UPDATE EmailPayloadReservation SET state='deleting',expiresAt=? WHERE token=? AND
        ((state IN ('staging','deleting') AND expiresAt<=?) OR
          (state='admitted' AND NOT EXISTS(SELECT 1 FROM EmailSubmission WHERE token=EmailPayloadReservation.token)))`)
        .bind(now + 60_000, token, now).run();
      await deleteEmailPayloads(token);
    } catch {
      logError('Email payload cleanup failed; reservation retained');
    }
  }
}
