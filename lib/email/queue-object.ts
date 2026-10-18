/**
 * Bulk email queue Durable Object.
 *
 * One instance per user (addressed with idFromName(userId)) owns all of that
 * user's bulk email sessions. Queue state is kept in Durable Object storage so
 * it survives eviction, and alarms replace the timers the Node server used.
 * Message content is stored per item and attachments live in R2 under
 * `email_queue/`, both loaded only when the item is sent.
 *
 * The object runs outside Next.js, so it does not touch Prisma. Quota refunds
 * for emails that were definitely not sent go back through the Worker's
 * `/api/internal/email-quota-refund` route.
 */
import { EmailQueueManager, type SerializedEmailQueue } from './email-queue';
import { getEmailProvider } from './provider-factory';
import { isDefinitelyUnsentProviderError } from './provider-errors';
import { MAX_BULK_RECIPIENTS } from './abuse-controls';
import {
  ACTIVE_QUEUE_TTL_MS,
  INGESTION_LEASE_MS,
  MAX_BULK_EMAILS,
  PAUSED_QUEUE_TTL_MS,
  TERMINAL_STATUS_TTL_MS,
  getMaxActiveQueuesPerUser,
  getMaxConcurrentIngestionsPerUser,
  getMaxPausedQueuesPerUser,
  getMaxRetainedAttachmentBytesPerUser
} from './bulk-limits';
import type { EmailAttachment, EmailParams, EmailProvider, EmailQueueItem, StoredAttachmentRef } from './types';
import type { DurableObjectState, Fetcher, R2Bucket } from '@/lib/cloudflare/types';
import { INTERNAL_KEY_HEADER, getInternalRequestKey } from '@/lib/server/internal-request';

export interface EmailQueueObjectEnv {
  FILES: R2Bucket;
  WORKER_SELF_REFERENCE?: Fetcher;
}

/** Content stored for one queued email. */
export interface QueuedEmailPayload {
  from: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EnqueueEmail {
  id: string;
  to: string[];
  payload: QueuedEmailPayload;
  attachmentKeys: StoredAttachmentRef[];
}

export interface EnqueueRequest {
  userId: string;
  ingestionToken: string;
  sessionId: string;
  emails: EnqueueEmail[];
  recipientCount: number;
  quotaReservationDay: string;
  deferProcessing?: boolean;
}

interface StoredSession {
  queue: SerializedEmailQueue;
  recipientCount: number;
  nextRunAt: number | null;
  completedAt: number | null;
}

interface SessionRecord {
  sessionId: string;
  manager: EmailQueueManager;
  recipientCount: number;
  nextRunAt: number | null;
  completedAt: number | null;
}

interface PendingRefund {
  reservationDay: string;
  recipientCount: number;
}

const SESSION_PREFIX = 'session:';
const PAYLOAD_PREFIX = 'payload:';
const USER_KEY = 'userId';
const REFUNDS_KEY = 'refunds';
const ALARM_STEP_BUDGET_MS = 25_000;
const MAX_INLINE_WAIT_MS = 1_000;
const REFUND_RETRY_MS = 60_000;

class QueueObjectError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function payloadKey(sessionId: string, itemId: string): string {
  return `${PAYLOAD_PREFIX}${sessionId}:${itemId}`;
}

/** Stands in when no provider is configured, rejecting every send before dispatch. */
const unconfiguredProvider: EmailProvider = {
  name: 'resend',
  isConfigured: () => false,
  getRateLimit: () => ({ limit: 1, remaining: 1, reset: new Date(), window: 'second' }),
  sendEmail: async () => ({
    id: '',
    success: false,
    error: 'PROVIDER_REJECTED: No email provider is configured',
    provider: 'resend'
  })
};

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class EmailQueueObject {
  private readonly state: DurableObjectState;
  private readonly env: EmailQueueObjectEnv;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ingestions = new Map<string, number>();
  private readonly pendingDeletes = { payloads: new Set<string>(), objects: new Set<string>() };
  private pendingRefunds: PendingRefund[] = [];
  private userId: string | null = null;
  private provider: EmailProvider | null = null;
  private readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: EmailQueueObjectEnv) {
    this.state = state;
    this.env = env;
    this.ready = state.blockConcurrencyWhile(() => this.load());
  }

  // ---------------------------------------------------------------------------
  // Loading and persistence

  private getProvider(): EmailProvider {
    if (!this.provider) this.provider = getEmailProvider();
    return this.provider;
  }

  private async load(): Promise<void> {
    this.userId = (await this.state.storage.get<string>(USER_KEY)) ?? null;
    this.pendingRefunds = (await this.state.storage.get<PendingRefund[]>(REFUNDS_KEY)) ?? [];
    const stored = await this.state.storage.list<StoredSession>({ prefix: SESSION_PREFIX });
    if (stored.size === 0) return;

    let provider: EmailProvider;
    try {
      provider = this.getProvider();
    } catch (error) {
      // Still load the sessions so they expire, refund and clean up; every
      // send fails as definitely unsent.
      console.error('Email queue restored without a configured provider:', error);
      provider = unconfiguredProvider;
    }
    for (const [key, value] of stored) {
      const sessionId = key.slice(SESSION_PREFIX.length);
      const record = this.createRecord(sessionId, provider, value);
      // Anything mid-send when the object stopped has an unknown outcome.
      record.manager.recoverInterruptedSends();
      await this.persist(record);
    }
  }

  private createRecord(sessionId: string, provider: EmailProvider, stored?: StoredSession): SessionRecord {
    const record = {
      sessionId,
      recipientCount: stored?.recipientCount ?? 0,
      nextRunAt: stored?.nextRunAt ?? null,
      completedAt: stored?.completedAt ?? null
    } as SessionRecord;
    const options = {
      scheduler: {
        schedule: (delayMs: number) => {
          record.nextRunAt = Date.now() + delayMs;
        },
        cancel: () => {
          record.nextRunAt = null;
        }
      },
      prepareSend: (item: EmailQueueItem) => this.prepareSend(sessionId, item)
    };
    record.manager = stored
      ? EmailQueueManager.restore(provider, stored.queue, options)
      : new EmailQueueManager(provider, options);
    record.manager.onItemCompleted((item, completion) => {
      this.pendingDeletes.payloads.add(payloadKey(sessionId, item.id));
      for (const attachment of completion.attachmentKeys) this.pendingDeletes.objects.add(attachment.key);
      const reservationDay = item.quotaReservationDay;
      if (
        item.status === 'failed' &&
        item.quotaRefundSafe !== false &&
        reservationDay &&
        isDefinitelyUnsentProviderError(item.lastError)
      ) {
        this.addRefund(reservationDay, item.to.length);
      }
    });
    this.sessions.set(sessionId, record);
    return record;
  }

  private addRefund(reservationDay: Date, recipientCount: number): void {
    const day = reservationDay.toISOString();
    const existing = this.pendingRefunds.find(refund => refund.reservationDay === day);
    if (existing) existing.recipientCount += recipientCount;
    else this.pendingRefunds.push({ reservationDay: day, recipientCount });
  }

  private async persist(record: SessionRecord): Promise<void> {
    const status = record.manager.getStatus().status;
    if (status === 'completed' && record.completedAt === null) record.completedAt = Date.now();
    if (status !== 'completed') record.completedAt = null;
    if (this.sessions.get(record.sessionId) === record) {
      const stored: StoredSession = {
        queue: record.manager.serialize(),
        recipientCount: record.recipientCount,
        nextRunAt: record.nextRunAt,
        completedAt: record.completedAt
      };
      await this.state.storage.put(SESSION_PREFIX + record.sessionId, stored);
    }
    await this.flushDeletes();
    await this.state.storage.put(REFUNDS_KEY, this.pendingRefunds);
  }

  private async flushDeletes(): Promise<void> {
    const payloads = [...this.pendingDeletes.payloads];
    const objects = [...this.pendingDeletes.objects];
    this.pendingDeletes.payloads.clear();
    this.pendingDeletes.objects.clear();
    for (let offset = 0; offset < payloads.length; offset += 128) {
      await this.state.storage.delete(payloads.slice(offset, offset + 128));
    }
    for (let offset = 0; offset < objects.length; offset += 1000) {
      try {
        await this.env.FILES.delete(objects.slice(offset, offset + 1000));
      } catch (error) {
        // The daily cleanup removes queued attachments after their retention.
        console.warn('Failed to delete sent email attachments:', error);
      }
    }
  }

  private async removeSession(record: SessionRecord): Promise<void> {
    this.sessions.delete(record.sessionId);
    await this.state.storage.delete(SESSION_PREFIX + record.sessionId);
    await this.flushDeletes();
    await this.state.storage.put(REFUNDS_KEY, this.pendingRefunds);
  }

  // ---------------------------------------------------------------------------
  // Sending

  private async prepareSend(sessionId: string, item: EmailQueueItem): Promise<EmailParams> {
    const payload = await this.state.storage.get<QueuedEmailPayload>(payloadKey(sessionId, item.id));
    if (!payload) throw new Error('PROVIDER_REJECTED: Queued email content is missing');

    const attachments: EmailAttachment[] = [];
    for (const ref of item.attachmentKeys || []) {
      let object;
      try {
        object = await this.env.FILES.get(ref.key);
      } catch {
        throw new Error('PROVIDER_BUSY: attachment storage is unavailable');
      }
      if (!object) throw new Error('PROVIDER_REJECTED: Queued attachment is missing');
      attachments.push({
        filename: ref.filename,
        content: Buffer.from(await object.arrayBuffer()),
        contentType: ref.contentType
      });
    }
    return { to: item.to, ...payload, attachments: attachments.length > 0 ? attachments : undefined };
  }

  private async flushRefunds(): Promise<void> {
    if (this.pendingRefunds.length === 0 || !this.userId) return;
    const key = getInternalRequestKey();
    const service = this.env.WORKER_SELF_REFERENCE;
    if (!key || !service) {
      console.error('Cannot refund email quota: NEXTAUTH_SECRET or WORKER_SELF_REFERENCE is missing');
      return;
    }
    const refunds = this.pendingRefunds;
    try {
      const response = await service.fetch('https://internal/api/internal/email-quota-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [INTERNAL_KEY_HEADER]: key },
        body: JSON.stringify({ userId: this.userId, refunds })
      });
      if (!response.ok) throw new Error(`Refund request failed with ${response.status}`);
      this.pendingRefunds = this.pendingRefunds.filter(refund => !refunds.includes(refund));
      await this.state.storage.put(REFUNDS_KEY, this.pendingRefunds);
    } catch (error) {
      console.error('Failed to release bulk email quota reservation:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduling

  private expiryTime(record: SessionRecord): number {
    const status = record.manager.getStatus().status;
    if (status === 'completed') return (record.completedAt ?? Date.now()) + TERMINAL_STATUS_TTL_MS;
    const ttl = status === 'paused' ? PAUSED_QUEUE_TTL_MS : ACTIVE_QUEUE_TTL_MS;
    return record.manager.getLastActivity() + ttl;
  }

  private async scheduleAlarm(): Promise<void> {
    let next = Number.POSITIVE_INFINITY;
    for (const record of this.sessions.values()) {
      if (record.nextRunAt !== null) next = Math.min(next, record.nextRunAt);
      next = Math.min(next, this.expiryTime(record));
    }
    if (this.pendingRefunds.length > 0) next = Math.min(next, Date.now() + REFUND_RETRY_MS);
    if (Number.isFinite(next)) {
      await this.state.storage.setAlarm(Math.max(next, Date.now()));
    } else {
      await this.state.storage.deleteAlarm();
    }
  }

  async alarm(): Promise<void> {
    await this.ready;
    const deadline = Date.now() + ALARM_STEP_BUDGET_MS;
    while (Date.now() < deadline) {
      let due: SessionRecord | null = null;
      for (const record of this.sessions.values()) {
        if (record.nextRunAt !== null && (!due || record.nextRunAt < (due.nextRunAt as number))) due = record;
      }
      if (!due) break;
      const wait = (due.nextRunAt as number) - Date.now();
      if (wait > MAX_INLINE_WAIT_MS) break;
      if (wait > 0) await sleep(wait);
      if (due.nextRunAt === null || this.sessions.get(due.sessionId) !== due) continue;
      due.nextRunAt = null;
      await due.manager.runNow();
      await this.persist(due);
    }
    await this.expireSessions();
    await this.flushRefunds();
    await this.scheduleAlarm();
  }

  private async expireSessions(now = Date.now()): Promise<void> {
    for (const record of [...this.sessions.values()]) {
      if (this.expiryTime(record) > now) continue;
      await record.manager.clear(true);
      await this.removeSession(record);
    }
  }

  /** Cancels the oldest paused queues beyond the per-user limit. */
  private async enforcePausedLimit(): Promise<void> {
    const paused = [...this.sessions.values()]
      .filter(record => record.manager.getStatus().status === 'paused')
      .sort((a, b) => a.manager.getLastActivity() - b.manager.getLastActivity());
    const excess = paused.length - getMaxPausedQueuesPerUser();
    for (const record of paused.slice(0, Math.max(0, excess))) {
      await record.manager.clear(true);
      await this.removeSession(record);
    }
  }

  // ---------------------------------------------------------------------------
  // Requests from the Worker

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    try {
      let response: Response;
      switch (`${request.method} ${url.pathname}`) {
        case 'POST /begin-ingestion':
          response = this.beginIngestion();
          break;
        case 'POST /end-ingestion':
          this.ingestions.delete(((await request.json()) as { token?: string }).token || '');
          response = json({ success: true });
          break;
        case 'POST /enqueue':
          response = await this.enqueue((await request.json()) as EnqueueRequest);
          break;
        case 'GET /status':
          response = this.status(url.searchParams.get('sessionId') || '');
          break;
        case 'POST /control':
          response = await this.control((await request.json()) as { sessionId: string; action: string });
          break;
        default:
          response = json({ error: 'Not found' }, 404);
      }
      await this.flushRefunds();
      await this.scheduleAlarm();
      return response;
    } catch (error) {
      if (error instanceof QueueObjectError) return json({ error: error.message }, error.status);
      console.error('Email queue object error:', error);
      return json({ error: 'Email queue error' }, 500);
    }
  }

  private beginIngestion(): Response {
    const now = Date.now();
    for (const [token, expiresAt] of this.ingestions) {
      if (expiresAt <= now) this.ingestions.delete(token);
    }
    if (this.ingestions.size >= getMaxConcurrentIngestionsPerUser()) {
      throw new QueueObjectError('Too many concurrent email uploads for this account', 429);
    }
    const token = crypto.randomUUID();
    this.ingestions.set(token, now + INGESTION_LEASE_MS);
    return json({ token });
  }

  private retainedAttachmentBytes(): number {
    let total = 0;
    for (const record of this.sessions.values()) total += record.manager.getRetainedAttachmentBytes();
    return total;
  }

  private async enqueue(body: EnqueueRequest): Promise<Response> {
    this.ingestions.delete(body.ingestionToken);
    if (!this.userId) {
      this.userId = body.userId;
      await this.state.storage.put(USER_KEY, body.userId);
    }

    let record = this.sessions.get(body.sessionId);
    if (record && record.manager.getStatus().status === 'completed') {
      await record.manager.clear();
      await this.removeSession(record);
      record = undefined;
    }
    if (!record) {
      const active = [...this.sessions.values()].filter(r => r.manager.getStatus().status !== 'completed').length;
      if (active >= getMaxActiveQueuesPerUser()) {
        throw new QueueObjectError('Too many active email queues for this account', 429);
      }
    }
    const queueLength = record?.manager.getQueueLength() ?? 0;
    if (queueLength + body.emails.length > MAX_BULK_EMAILS) {
      throw new QueueObjectError(`A bulk email session can contain at most ${MAX_BULK_EMAILS} emails`, 413);
    }
    if ((record?.recipientCount ?? 0) + body.recipientCount > MAX_BULK_RECIPIENTS) {
      throw new QueueObjectError(`A bulk email session can contain at most ${MAX_BULK_RECIPIENTS} recipients`, 413);
    }
    const addedBytes = body.emails.reduce(
      (total, email) => total + email.attachmentKeys.reduce((sum, ref) => sum + ref.size, 0),
      0
    );
    if (this.retainedAttachmentBytes() + addedBytes > getMaxRetainedAttachmentBytesPerUser()) {
      throw new QueueObjectError('Account email attachments exceed the retained size limit', 413);
    }

    let provider: EmailProvider;
    try {
      provider = this.getProvider();
    } catch {
      throw new QueueObjectError('No email provider configured. Please set up Resend or AWS SES.', 500);
    }
    if (!record) record = this.createRecord(body.sessionId, provider);

    const payloads: Record<string, QueuedEmailPayload> = {};
    for (const email of body.emails) payloads[payloadKey(body.sessionId, email.id)] = email.payload;
    const entries = Object.entries(payloads);
    for (let offset = 0; offset < entries.length; offset += 128) {
      await this.state.storage.put(Object.fromEntries(entries.slice(offset, offset + 128)));
    }

    const reservationDay = new Date(body.quotaReservationDay);
    await record.manager.addToQueue(
      body.emails.map(email => ({
        id: email.id,
        to: email.to,
        attachmentKeys: email.attachmentKeys,
        attachmentBytes: email.attachmentKeys.reduce((sum, ref) => sum + ref.size, 0),
        quotaReservationDay: reservationDay
      }))
    );
    record.recipientCount += body.recipientCount;
    if (!body.deferProcessing) await record.manager.processQueue({ deferred: true });
    await this.persist(record);

    return json({ queueLength: record.manager.getQueueLength(), status: record.manager.getStatus() });
  }

  private status(sessionId: string): Response {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return json({ status: 'idle', processed: 0, failed: 0, total: 0, remaining: 0 });
    }
    return json(record.manager.getStatus());
  }

  private async control(body: { sessionId: string; action: string }): Promise<Response> {
    const record = this.sessions.get(body.sessionId);
    if (!record) {
      throw new QueueObjectError('No active queue found', 404);
    }
    switch (body.action) {
      case 'pause':
        await record.manager.pause();
        await this.persist(record);
        await this.enforcePausedLimit();
        break;
      case 'resume':
        await record.manager.resume({ deferred: true });
        await this.persist(record);
        break;
      case 'start':
        if (!record.manager.isProcessing()) await record.manager.processQueue({ deferred: true });
        await this.persist(record);
        break;
      case 'cancel':
        await record.manager.clear(true);
        await this.removeSession(record);
        break;
      default:
        throw new QueueObjectError('Invalid action', 400);
    }
    return json({ success: true });
  }
}
