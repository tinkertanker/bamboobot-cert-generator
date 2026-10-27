import { createHash, randomUUID } from 'crypto';
import type { EmailParams, EmailProvider, EmailResult } from '@/lib/email/types';
import { cloudflare } from '@/lib/server/cloudflare';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { getTierLimits, type UserTier } from '@/types/user';
import { EmailRequestError } from '@/lib/email/abuse-controls';
import { isDefinitelyUnsentProviderError, isProviderBackpressureError, providerRetryAfterSeconds, publicProviderError } from '@/lib/email/provider-errors';
import { detectUserTier } from '@/lib/server/tiers';

const HOUR = 3600000;
const LEASE_MS = 5 * 60 * 1000;

// Attachments live in private R2, not D1 rows or isolate-local maps. The tagged
// representation preserves Buffer vs provider-ready base64 string content.
function serialise(email: EmailParams): string {
  return JSON.stringify({ ...email, attachments: email.attachments?.map(a => ({
    ...a, content: Buffer.isBuffer(a.content) ? { base64: a.content.toString('base64') } : a.content,
  })) });
}

export async function enqueueWorkerEmails(ownerId: string, sessionId: string,
  emails: EmailParams[], defer: boolean, policy: Record<string, number>) {
  const { DB: db, FILES: files } = cloudflare().env;
  const id = `${ownerId}:${sessionId}`;
  const bodies = emails.map(serialise);
  const submission = createHash('sha256').update(id).update(JSON.stringify(bodies)).digest('hex');
  if (await db.prepare('SELECT id FROM EmailSubmission WHERE id=?').bind(submission).first()) {
    const status = await getWorkerEmailStatus(ownerId, sessionId);
    return { success: true, queueLength: status.total, status };
  }
  const now = Date.now();
  const day = new Date(new Date(now).setUTCHours(0, 0, 0, 0)).toISOString().replace('Z', '+00:00');
  await db.prepare(`UPDATE User SET dailyEmailCount=0,dailyPdfCount=0,lastUsageReset=? WHERE id=? AND lastUsageReset<?`)
    .bind(new Date(now).toISOString().replace('Z', '+00:00'), ownerId, day).run();
  const user = await db.prepare('SELECT email,tier,tierSource,lastUsageReset FROM User WHERE id=?').bind(ownerId)
    .first<{ email: string | null; tier: UserTier; tierSource: string; lastUsageReset: string }>();
  if (!user) throw new EmailRequestError('User not found', 401);
  const effectiveTier = detectUserTier(user.email, user.tier, user.tierSource === 'manual' ? 'manual' : 'env');
  const provider = getEmailProvider();
  const token = randomUUID();
  const items = [];
  const payloadKeys = bodies.map((_, index) => `mail-payload/${token}/${index}.json`);
  try {
    for (let index = 0; index < emails.length; index++) {
      const email = emails[index];
      const payloadKey = payloadKeys[index];
      await files.put(payloadKey, bodies[index], { httpMetadata: { contentType: 'application/json' } });
      items.push({ id: randomUUID(), payloadKey, recipients: JSON.stringify(email.to), recipientCount: email.to.length,
        attachmentBytes: email.attachments?.reduce((n, a) => n + (typeof a.content === 'string' ? Buffer.byteLength(a.content) : a.content?.length || 0), 0) || 0 });
    }
  } catch (error) {
    // No database admission was attempted, so even an uncertain put is disposable.
    if (payloadKeys.length) await files.delete(payloadKeys);
    throw error;
  }
  try {
    // The trigger charges each inserted item in this native atomic batch. The
    // token makes concurrent identical submissions a no-op, not a second send.
    await db.batch([
      db.prepare(`INSERT INTO EmailJob(id,ownerId,status,provider,policy,updatedAt,expiresAt) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET status=CASE WHEN status IN ('paused','cancelled') THEN status ELSE excluded.status END,
          policy=excluded.policy`)
        .bind(id, ownerId, defer ? 'idle' : 'processing', provider.name, JSON.stringify(policy), now, now + HOUR),
      db.prepare('INSERT INTO EmailSubmission(id,jobId,token) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(submission, id, token),
      db.prepare(`INSERT INTO EmailItem(id,jobId,submissionId,recipients,recipientCount,payloadKey,attachmentBytes,quotaDay,quotaLimit,quotaTier,availableAt)
        SELECT json_extract(value,'$.id'), ?, ?, json_extract(value,'$.recipients'), json_extract(value,'$.recipientCount'),
          json_extract(value,'$.payloadKey'), json_extract(value,'$.attachmentBytes'), ?, ?, ?, ?
        FROM json_each(?) WHERE EXISTS(SELECT 1 FROM EmailSubmission WHERE id=? AND token=?)`)
        .bind(id, submission, user.lastUsageReset, getTierLimits(effectiveTier).dailyEmailLimit, user.tier, now,
          JSON.stringify(items), submission, token),
      db.prepare(`UPDATE EmailJob SET status=CASE WHEN status='paused' THEN 'paused' ELSE ? END,updatedAt=?,
        expiresAt=CASE WHEN status='paused' THEN ? ELSE ? END
        WHERE id=? AND status!='cancelled' AND EXISTS(SELECT 1 FROM EmailSubmission WHERE id=? AND token=?)`)
        .bind(defer ? 'idle' : 'processing', now, now + 24 * HOUR, now + HOUR, id, submission, token),
    ]);
  } catch (error) {
    // Keep possible committed payloads after an unknown D1 response. An expiry
    // sweep removes unreferenced objects; never guess that a failed RPC rolled back.
    const message = String(error);
    if (/EMAIL_(QUOTA_CHANGED|QUEUE_CANCELLED|QUEUE_CAPACITY|SESSION_LIMIT|ATTACHMENT_CAPACITY)/.test(message)) {
      // These are explicit RAISE(ABORT) results from the atomic admission trigger.
      if (payloadKeys.length) await files.delete(payloadKeys);
    }
    if (message.includes('EMAIL_QUOTA_CHANGED')) throw new EmailRequestError('Email quota changed or limit reached', 403);
    if (message.includes('EMAIL_')) throw new EmailRequestError('Email queue or attachment capacity reached', 429);
    throw error;
  }
  const admitted = await db.prepare('SELECT token FROM EmailSubmission WHERE id=?').bind(submission).first<{ token: string }>();
  if (admitted && admitted.token !== token && payloadKeys.length) {
    // A concurrent identical submission won; only its payloads are referenced.
    await files.delete(payloadKeys);
  }
  const status = await getWorkerEmailStatus(ownerId, sessionId);
  return { success: true, queueLength: status.total, status };
}

export async function getWorkerEmailStatus(ownerId: string, sessionId: string) {
  const db = cloudflare().env.DB;
  const id = `${ownerId}:${sessionId}`;
  const job = await db.prepare('SELECT status,provider FROM EmailJob WHERE id=? AND ownerId=?').bind(id, ownerId)
    .first<{ status: string; provider: string }>();
  const items = await db.prepare('SELECT status,recipients,error FROM EmailItem WHERE jobId=? ORDER BY rowid').bind(id)
    .all<{ status: string; recipients: string; error: string | null }>();
  const total = items.results.length;
  const processed = items.results.filter(i => i.status === 'sent').length;
  const failures = items.results.filter(i => i.status === 'refunded' || i.status === 'unknown');
  const sendingIndex = items.results.findIndex(i => i.status === 'sending');
  const terminal = total > 0 && processed + failures.length === total;
  return {
    status: terminal || job?.status === 'cancelled' ? 'completed' : job?.status || 'idle',
    processed, failed: failures.length, total, remaining: items.results.filter(i => i.status === 'pending').length,
    provider: job?.provider || getEmailProvider().name,
    rateLimit: { limit: getEmailProvider().getRateLimit().limit, remaining: getEmailProvider().getRateLimit().remaining, resetIn: 1000 },
    currentEmail: sendingIndex >= 0 ? JSON.parse(items.results[sendingIndex].recipients).join(', ') : undefined,
    currentIndex: sendingIndex >= 0 ? sendingIndex : undefined,
    failedEmails: failures.length ? failures.map(i => ({ email: JSON.parse(i.recipients).join(', '), error: publicProviderError(i.error || undefined) })) : undefined,
  };
}

export async function controlWorkerEmails(ownerId: string, sessionId: string, action: string): Promise<void> {
  const db = cloudflare().env.DB;
  const id = `${ownerId}:${sessionId}`;
  if (!['pause', 'resume', 'start', 'cancel'].includes(action)) throw new EmailRequestError('Invalid action');
  const now = Date.now();
  const status = action === 'pause' ? 'paused' : action === 'cancel' ? 'cancelled' : 'processing';
  // The control and pending refunds commit together. Claimed/in-flight items
  // remain charged; replaying cancel cannot refund any item a second time.
  const result = await db.batch([
    db.prepare(`UPDATE EmailJob SET status=?,updatedAt=?,expiresAt=? WHERE id=? AND ownerId=? AND (status!='cancelled' OR ?='cancel')`)
      .bind(status, now, now + (status === 'paused' ? 24 * HOUR : HOUR), id, ownerId, action),
    db.prepare(`UPDATE EmailItem SET status='refunded',error='PROVIDER_REJECTED: Cancelled before dispatch' WHERE jobId=? AND status='pending' AND ?='cancel'`).bind(id, action),
  ]);
  if (!result[0].meta.changes) throw new EmailRequestError('No active queue found', 404);
  if (action === 'pause') await enforceWorkerPausedPressure();
}

/** Evict the oldest paused queues, refunding only work not yet dispatched. */
async function enforceWorkerPausedPressure(): Promise<void> {
  const db = cloudflare().env.DB;
  for (let attempt = 0; attempt < 100; attempt++) {
    const results = await db.batch([
      db.prepare(`UPDATE EmailJob SET status='cancelled' WHERE id=(
        SELECT j.id FROM EmailJob j WHERE j.status='paused' AND (
          (SELECT count(*) FROM EmailJob WHERE status='paused')>json_extract(j.policy,'$.pausedGlobal') OR
          (SELECT count(*) FROM EmailJob WHERE status='paused' AND ownerId=j.ownerId)>json_extract(j.policy,'$.pausedPerUser') OR
          (SELECT coalesce(sum(i.attachmentBytes),0) FROM EmailItem i JOIN EmailJob p ON p.id=i.jobId
            WHERE p.status='paused' AND i.status IN ('pending','sending'))>json_extract(j.policy,'$.pausedBytes'))
        ORDER BY j.updatedAt,j.id LIMIT 1)`),
      db.prepare(`UPDATE EmailItem SET status='refunded',error='PROVIDER_REJECTED: Paused queue evicted under pressure'
        WHERE status='pending' AND jobId IN (SELECT id FROM EmailJob WHERE status='cancelled')`),
    ]);
    if (!results[0].meta.changes) return;
  }
}

export async function processWorkerEmails(provider: EmailProvider = getEmailProvider(), maxDurationMs = 15_000, onlyJobId: string | null = null): Promise<void> {
  const db = cloudflare().env.DB;
  const deadline = Date.now() + maxDurationMs;
  // Expired dispatches are ambiguous, even if they died before contacting SES.
  // Never retry or refund them: there is no provider idempotency guarantee.
  await db.prepare(`UPDATE EmailItem SET status='unknown',error='Delivery unconfirmed after worker interruption'
    WHERE status='sending' AND leaseUntil<=?`).bind(Date.now()).run();
  await db.prepare(`UPDATE EmailJob SET status='completed',expiresAt=? WHERE status IN ('processing','paused','idle')
    AND EXISTS(SELECT 1 FROM EmailItem WHERE jobId=EmailJob.id)
    AND NOT EXISTS(SELECT 1 FROM EmailItem WHERE jobId=EmailJob.id AND status IN ('pending','sending'))`)
    .bind(Date.now() + 10 * 60 * 1000).run();
  for (let count = 0; count < 100 && Date.now() < deadline; count++) {
    const token = randomUUID();
    const row = await db.prepare(`UPDATE EmailItem SET status='sending',leaseToken=?,leaseUntil=?,attempts=attempts+1
      WHERE id=(SELECT i.id FROM EmailItem i JOIN EmailJob j ON j.id=i.jobId WHERE i.status='pending' AND i.availableAt<=?
        AND j.status='processing' AND j.expiresAt>? AND (? IS NULL OR j.id=?) ORDER BY i.rowid LIMIT 1)
      RETURNING id,jobId,payloadKey,attempts,(SELECT json_extract(policy,'$.synchronous') FROM EmailJob WHERE id=jobId) AS synchronous`)
      .bind(token, Date.now() + LEASE_MS, Date.now(), Date.now(), onlyJobId, onlyJobId)
      .first<{ id: string; jobId: string; payloadKey: string; attempts: number; synchronous: number | null }>();
    if (!row) break;
    let result: EmailResult;
    try {
      const object = await cloudflare().env.FILES.get(row.payloadKey);
      if (!object) throw new Error('Email payload unavailable');
      const params = JSON.parse(await object.text(), (key, value) => key === 'content' && value?.base64
        ? Buffer.from(value.base64, 'base64') : value) as EmailParams;
      const job = await db.prepare('SELECT provider FROM EmailJob WHERE id=?').bind(row.jobId).first<{ provider: string }>();
      result = job?.provider === provider.name ? await provider.sendEmail(params)
        : { id: '', provider: provider.name, success: false, error: 'PROVIDER_REJECTED: Configured provider changed' };
    } catch {
      result = { id: '', provider: provider.name, success: false, error: 'Delivery unconfirmed' };
    }
    const retry = !row.synchronous && !result.success && isProviderBackpressureError(result.error) && row.attempts <= 60;
    const status = result.success ? 'sent' : retry ? 'pending'
      : isDefinitelyUnsentProviderError(result.error) ? 'refunded' : 'unknown';
    await db.prepare(`UPDATE EmailItem SET status=?,error=?,providerId=?,availableAt=?,leaseToken=NULL,leaseUntil=0
      WHERE id=? AND status='sending' AND leaseToken=?`)
      .bind(status, result.error || null, result.id || null,
        Date.now() + providerRetryAfterSeconds(result.error) * 1000, row.id, token).run();
    await db.prepare(`UPDATE EmailJob SET status='completed',updatedAt=?,expiresAt=? WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM EmailItem WHERE jobId=? AND status IN ('pending','sending'))`)
      .bind(Date.now(), Date.now() + 10 * 60 * 1000, row.jobId, row.jobId).run();
    if (retry) {
      const delay = providerRetryAfterSeconds(result.error) * 1000;
      if (Date.now() + delay >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/** Synchronous single/test sends use the same durable quota and outcome ledger. */
export async function sendWorkerEmail(ownerId: string, email: EmailParams): Promise<EmailResult> {
  const sessionId = `single-${randomUUID()}`;
  await enqueueWorkerEmails(ownerId, sessionId, [email], false, {
    activePerUser: 5, activeGlobal: 100, queueBytes: 100 * 1024 * 1024,
    userBytes: 250 * 1024 * 1024, globalBytes: 512 * 1024 * 1024, synchronous: 1,
  });
  const provider = getEmailProvider();
  await processWorkerEmails(provider, 15_000, `${ownerId}:${sessionId}`);
  const item = await cloudflare().env.DB.prepare('SELECT status,error,providerId FROM EmailItem WHERE jobId=?')
    .bind(`${ownerId}:${sessionId}`).first<{ status: string; error: string | null; providerId: string | null }>();
  return { provider: provider.name, id: item?.providerId || '', success: item?.status === 'sent', error: item?.error || undefined };
}

export async function expireWorkerEmails(): Promise<void> {
  const db = cloudflare().env.DB;
  const now = Date.now();
  await enforceWorkerPausedPressure();
  // All pending refunds and the terminal state commit together. Sending items
  // remain until lease recovery records their conservative unknown outcome.
  await db.batch([
    db.prepare(`UPDATE EmailItem SET status='refunded',error='PROVIDER_REJECTED: Queue expired before dispatch'
      WHERE status='pending' AND jobId IN (SELECT id FROM EmailJob WHERE expiresAt<=?)`).bind(now),
    db.prepare(`UPDATE EmailJob SET status='cancelled' WHERE expiresAt<=? AND status!='completed'`).bind(now),
    db.prepare(`DELETE FROM EmailJob WHERE expiresAt<=? AND NOT EXISTS(SELECT 1 FROM EmailItem WHERE jobId=EmailJob.id AND status='sending')`).bind(now),
    db.prepare('DELETE FROM EmailIngestion WHERE expiresAt<=?').bind(now),
  ]);
}

export async function withWorkerEmailIngestion<T>(ownerId: string, perUser: number, global: number, operation: () => Promise<T>): Promise<T> {
  const db = cloudflare().env.DB;
  const id = randomUUID();
  const now = Date.now();
  const admitted = await db.prepare(`INSERT INTO EmailIngestion(id,ownerId,expiresAt) SELECT ?,?,?
    WHERE (SELECT count(*) FROM EmailIngestion WHERE ownerId=? AND expiresAt>?)<?
      AND (SELECT count(*) FROM EmailIngestion WHERE expiresAt>?)<? RETURNING id`)
    .bind(id, ownerId, now + 30 * 60 * 1000, ownerId, now, perUser, now, global).first();
  if (!admitted) throw new EmailRequestError('Too many concurrent email uploads', 429);
  try { return await operation(); }
  finally { await db.prepare('DELETE FROM EmailIngestion WHERE id=?').bind(id).run(); }
}
