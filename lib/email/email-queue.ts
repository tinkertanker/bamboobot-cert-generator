import { v4 as uuidv4 } from 'uuid';
import type {
  EmailQueue,
  EmailQueueItem,
  EmailParams,
  BulkEmailProgress,
  EmailProvider,
  StoredAttachmentRef
} from './types';
import { formatRecipients } from '@/utils/email-validation';
import { isDefinitelyUnsentProviderError, publicProviderError } from './provider-errors';

/**
 * Hooks that let a host other than a long-lived Node process run the queue.
 * The Cloudflare Durable Object uses them to drive processing from alarms and
 * to load each email's content and attachments from storage at send time.
 */
export interface EmailQueueManagerOptions {
  /** Replaces setTimeout-based scheduling of the next processing step. */
  scheduler?: {
    schedule(delayMs: number): void;
    cancel(): void;
  };
  /** Builds the message to send. Defaults to the content held on the item. */
  prepareSend?: (item: EmailQueueItem) => Promise<EmailParams>;
}

export interface EmailQueueItemCompletion {
  /** Stored attachment objects that the completed item no longer needs. */
  attachmentKeys: StoredAttachmentRef[];
}

/** Queue state that can be written to storage and restored later. */
export interface SerializedEmailQueue {
  status: EmailQueue['status'];
  processed: number;
  failed: number;
  lastActivity: number;
  items: Array<
    Omit<EmailQueueItem, 'createdAt' | 'sentAt' | 'nextRetryAt' | 'quotaReservationDay' | 'attachments'> & {
      createdAt: string;
      sentAt?: string;
      nextRetryAt?: string;
      quotaReservationDay?: string;
    }
  >;
}

function toDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

export class EmailQueueManager {
  private queue: EmailQueue;
  private provider: EmailProvider;
  private processInterval: NodeJS.Timeout | null = null;
  private workerPromise: Promise<void> | null = null;
  private onProgress?: (progress: BulkEmailProgress) => void;
  private onItemComplete?: (item: EmailQueueItem, completion: EmailQueueItemCompletion) => void;
  private lastActivity: number = Date.now();
  private consecutiveProviderCapacityDeferrals = 0;
  private readonly options: EmailQueueManagerOptions;

  constructor(provider: EmailProvider, options: EmailQueueManagerOptions = {}) {
    this.provider = provider;
    this.options = options;
    this.queue = {
      items: [],
      status: 'idle',
      processed: 0,
      failed: 0,
      provider: this.provider.name,
      rateLimit: this.provider.getRateLimit()
    };
  }

  /**
   * Add emails to the queue
   */
  async addToQueue(
    emails: (Partial<EmailParams> &
      Pick<EmailParams, 'to'> & {
        id?: string;
        certificateUrl?: string;
        quotaReservationDay?: Date;
        attachmentKeys?: StoredAttachmentRef[];
        attachmentBytes?: number;
      })[]
  ): Promise<void> {
    const newItems: EmailQueueItem[] = emails.map(email => ({
      id: email.id || uuidv4(),
      to: email.to,
      from: email.from,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
      attachmentKeys: email.attachmentKeys,
      attachmentBytes: email.attachmentBytes,
      certificateUrl: email.certificateUrl,
      quotaReservationDay: email.quotaReservationDay,
      quotaRefundSafe: !!email.quotaReservationDay,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    }));

    this.queue.items.push(...newItems);
    if (this.queue.status === 'completed') this.queue.status = 'idle';
    this.lastActivity = Date.now();
  }

  /**
   * Start processing the queue
   */
  async processQueue(options: { deferred?: boolean } = {}): Promise<void> {
    if (this.queue.status === 'processing') {
      console.log('Queue already processing');
      return;
    }

    this.queue.status = 'processing';
    this.consecutiveProviderCapacityDeferrals = 0;
    this.lastActivity = Date.now();
    if (options.deferred) {
      this.scheduleWorker(0);
      return;
    }
    await this.runWorker();
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    this.queue.status = 'paused';
    this.lastActivity = Date.now();
    this.cancelScheduledWorker();
  }

  /**
   * Resume queue processing
   */
  async resume(options: { deferred?: boolean } = {}): Promise<void> {
    if (this.queue.status !== 'paused') {
      return;
    }
    this.queue.status = 'processing';
    this.consecutiveProviderCapacityDeferrals = 0;
    for (const item of this.queue.items) {
      if (item.status === 'pending') item.backpressureDeferrals = 0;
    }
    this.lastActivity = Date.now();
    if (options.deferred) {
      this.scheduleWorker(0);
      return;
    }
    await this.runWorker();
  }

  /** Runs one processing step now. Hosts with their own scheduler call this. */
  runNow(): Promise<void> {
    return this.runWorker();
  }

  private runWorker(): Promise<void> {
    if (this.workerPromise) return this.workerPromise;
    const worker = this._processQueue().finally(() => {
      if (this.workerPromise === worker) this.workerPromise = null;
    });
    this.workerPromise = worker;
    return worker;
  }

  private cancelScheduledWorker(): void {
    this.options.scheduler?.cancel();
    if (this.processInterval) {
      clearTimeout(this.processInterval);
      this.processInterval = null;
    }
  }

  private scheduleWorker(delay: number): void {
    if (this.options.scheduler) {
      this.options.scheduler.schedule(Math.max(0, delay));
      return;
    }
    if (this.processInterval) clearTimeout(this.processInterval);
    this.processInterval = setTimeout(
      () => {
        this.processInterval = null;
        void this.runWorker();
      },
      Math.max(0, delay)
    );
  }

  /**
   * Calculate exponential backoff delay in milliseconds
   */
  private calculateRetryDelay(attempts: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);

    // Add jitter to prevent thundering herd (±20% randomization)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.round(delay + jitter);
  }

  private releaseItemPayload(item: EmailQueueItem): void {
    item.from = undefined;
    item.subject = undefined;
    item.html = undefined;
    item.text = undefined;
    item.attachments = undefined;
    item.attachmentKeys = undefined;
    item.attachmentBytes = undefined;
    item.certificateUrl = undefined;
    item.certificatePath = undefined;
  }

  private completeItem(item: EmailQueueItem): void {
    const attachmentKeys = item.attachmentKeys || [];
    this.releaseItemPayload(item);
    try {
      this.onItemComplete?.(item, { attachmentKeys });
    } catch (error) {
      // Accounting/telemetry callbacks must never resurrect a delivered item.
      console.error('Email queue completion callback failed:', error);
    } finally {
      item.quotaReservationDay = undefined;
      item.quotaRefundSafe = undefined;
    }
  }

  /**
   * Process the queue respecting rate limits
   */
  private async _processQueue(): Promise<void> {
    if (this.queue.status !== 'processing') {
      return;
    }

    // Update rate limit info
    this.queue.rateLimit = this.provider.getRateLimit();

    // Find next pending item that's ready for processing
    const pendingItemIndex = this.queue.items.findIndex(
      item => item.status === 'pending' && (!item.nextRetryAt || item.nextRetryAt <= new Date())
    );
    const pendingItem = pendingItemIndex >= 0 ? this.queue.items[pendingItemIndex] : null;

    if (!pendingItem) {
      // Check if there are items waiting for retry
      const waitingItems = this.queue.items.filter(
        item => item.status === 'pending' && item.nextRetryAt && item.nextRetryAt > new Date()
      );

      if (waitingItems.length > 0) {
        // Find the next retry time and schedule processing
        const nextRetryTimes = waitingItems.map(item => item.nextRetryAt!).sort((a, b) => a.getTime() - b.getTime());
        const nextRetryTime = nextRetryTimes[0];
        const waitTime = nextRetryTime.getTime() - Date.now();

        console.log(`All pending items are waiting for retry. Next retry in ${waitTime}ms`);
        this.scheduleWorker(waitTime);
        return;
      }

      // No more items to process
      this.queue.status = this.queue.items.length > 0 ? 'completed' : 'idle';
      this.reportProgress();
      return;
    }

    // Check rate limit
    if (this.queue.rateLimit.remaining <= 0) {
      // Wait until rate limit resets
      const waitTime = this.queue.rateLimit.reset.getTime() - Date.now();
      if (waitTime > 0) {
        console.log(`Rate limit reached. Waiting ${waitTime}ms`);
        this.scheduleWorker(waitTime);
        return;
      }
    }

    // Process the item
    pendingItem.status = 'sending';
    pendingItem.attempts++;

    // Update current email in status
    this.reportProgress(formatRecipients(pendingItem.to), pendingItemIndex);

    try {
      await this.sendEmail(pendingItem);
      pendingItem.status = 'sent';
      pendingItem.sentAt = new Date();
      this.queue.processed++;
      this.consecutiveProviderCapacityDeferrals = 0;
      // Retention of linked certificates is extended when the email is queued.
      this.completeItem(pendingItem);
    } catch (error) {
      console.error(`Failed to send email to ${pendingItem.to}:`, error);
      pendingItem.lastError = error instanceof Error ? error.message : 'Unknown error';
      const isDefinitelyUnsent = isDefinitelyUnsentProviderError(pendingItem.lastError);
      if (!isDefinitelyUnsent) {
        // Never clear this taint: a later rejection or cancellation cannot
        // prove that an earlier ambiguous attempt was not delivered.
        pendingItem.quotaRefundSafe = false;
        // Retrying after a lost success response can duplicate a non-idempotent
        // email send. Ambiguous post-dispatch outcomes are always terminal.
        pendingItem.status = 'failed';
        this.queue.failed++;
        this.completeItem(pendingItem);
        console.log(`Email ${pendingItem.id} stopped after an ambiguous delivery outcome`);
      } else {
        const isProviderRejected = pendingItem.lastError?.startsWith('PROVIDER_REJECTED:');
        const isProviderCapacity = pendingItem.lastError?.startsWith('PROVIDER_CAPACITY:');
        const isProviderBusy = pendingItem.lastError?.startsWith('PROVIDER_BUSY:');
        const isProviderBackpressure = isProviderCapacity || isProviderBusy;
        if (isProviderRejected) {
          this.consecutiveProviderCapacityDeferrals = 0;
          pendingItem.status = 'failed';
          this.queue.failed++;
          this.completeItem(pendingItem);
          console.log(`Email ${pendingItem.id} was definitively rejected`);
        } else if (isProviderBackpressure) {
          this.consecutiveProviderCapacityDeferrals = isProviderCapacity
            ? this.consecutiveProviderCapacityDeferrals + 1
            : 0;
          pendingItem.attempts = Math.max(0, pendingItem.attempts - 1);
          pendingItem.backpressureDeferrals = (pendingItem.backpressureDeferrals || 0) + 1;
        } else {
          this.consecutiveProviderCapacityDeferrals = 0;
          pendingItem.backpressureDeferrals = 0;
        }
        if (isProviderRejected) {
          // Terminal and refund-safe; completion already handled above.
        } else if (this.consecutiveProviderCapacityDeferrals > 60) {
          for (const item of this.queue.items) {
            if (item.status !== 'pending' && item.status !== 'sending') continue;
            item.status = 'failed';
            item.lastError = pendingItem.lastError;
            this.queue.failed++;
            this.completeItem(item);
          }
          this.queue.status = 'completed';
          console.log('Email queue stopped after sustained provider backpressure');
        } else if (isProviderBusy && (pendingItem.backpressureDeferrals || 0) > 60) {
          // Local provider mutex contention says nothing about provider health.
          // Preserve the queue for an explicit resume or bounded paused cleanup.
          pendingItem.status = 'pending';
          pendingItem.nextRetryAt = undefined;
          this.queue.status = 'paused';
          console.log('Email queue paused after sustained local provider contention');
        } else {
          const canDeferBackpressure = (pendingItem.backpressureDeferrals || 0) <= 60;

          if (
            (isProviderBackpressure && canDeferBackpressure) ||
            (!isProviderBackpressure && pendingItem.attempts < 3)
          ) {
            pendingItem.status = 'pending';
            const providerResetDelay = Math.max(0, this.provider.getRateLimit().reset.getTime() - Date.now());
            const capacityJitter = Math.floor(Math.random() * 250);
            const retryDelay = isProviderBusy
              ? Math.min(1000 * Math.pow(2, Math.min((pendingItem.backpressureDeferrals || 1) - 1, 5)), 30_000)
              : isProviderCapacity
                ? Math.max(1000, providerResetDelay) + capacityJitter
                : this.calculateRetryDelay(pendingItem.attempts);
            pendingItem.nextRetryAt = new Date(Date.now() + retryDelay);
            console.log(
              `Email ${pendingItem.id} failed (attempt ${pendingItem.attempts}). Next retry in ${retryDelay}ms`
            );
          } else {
            pendingItem.status = 'failed';
            this.queue.failed++;
            this.completeItem(pendingItem);
            console.log(`Email ${pendingItem.id} permanently failed after ${pendingItem.attempts} attempts`);
          }
        }
      }
    }

    // Report progress
    this.reportProgress();

    // Schedule next item processing
    if (this.queue.status === 'processing') {
      this.scheduleWorker(this.getProcessingDelay());
    }

    this.lastActivity = Date.now();
  }

  /**
   * Send individual email
   */
  private async sendEmail(item: EmailQueueItem): Promise<void> {
    if (this.options.prepareSend) {
      const prepared = await this.options.prepareSend(item);
      const preparedResult = await this.provider.sendEmail(prepared);
      if (!preparedResult.success) {
        throw new Error(preparedResult.error || 'Failed to send email');
      }
      return;
    }
    const params: EmailParams = {
      to: item.to,
      from: item.from || process.env.EMAIL_FROM || 'noreply@certificates.com',
      subject: item.subject || 'Your Certificate',
      html: item.html || '',
      text: item.text,
      attachments: item.attachments
    };

    const result = await this.provider.sendEmail(params);

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }
  }

  /**
   * Build email content from template
   */
  private buildEmailContent(item: EmailQueueItem): {
    subject: string;
    html: string;
    text: string;
  } {
    // This should use the email config from the UI
    // For now, using defaults
    const subject = 'Your Certificate is Ready';
    const downloadUrl = item.certificateUrl;

    const html = `
      <div style="font-family: Arial, sans-serif;">
        <h2>Your Certificate is Ready!</h2>
        <p>Thank you for participating. Your certificate is now available for download.</p>
        <p style="margin: 30px 0;">
          <a href="${downloadUrl}" 
             style="background-color: #2D6A4F; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Download Certificate
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          This link will expire in 90 days. Please download your certificate promptly.
        </p>
      </div>
    `;

    const text = `Your Certificate is Ready!\n\nDownload your certificate here: ${downloadUrl}\n\nThis link will expire in 90 days.`;

    return { subject, html, text };
  }

  /**
   * Get processing delay based on provider
   */
  private getProcessingDelay(): number {
    if (this.provider.name === 'ses') {
      // SES: respect per-second rate limit
      return 1000 / this.queue.rateLimit.limit;
    } else {
      // Resend: send as fast as possible (small delay to prevent overwhelming)
      return 100; // 100ms between emails
    }
  }

  /**
   * Report progress
   */
  private reportProgress(currentEmail?: string, currentIndex?: number): void {
    if (!this.onProgress) return;

    const total = this.queue.items.length;
    const sent = this.queue.items.filter(i => i.status === 'sent').length;
    const failed = this.queue.items.filter(i => i.status === 'failed').length;
    const remaining = this.queue.items.filter(i => i.status === 'pending').length;

    const estimatedTimeRemaining = (remaining * this.getProcessingDelay()) / 1000; // in seconds

    this.onProgress({
      total,
      sent,
      failed,
      remaining,
      estimatedTimeRemaining,
      currentEmail,
      currentIndex
    });
  }

  /**
   * Set progress callback
   */
  onProgressUpdate(callback: (progress: BulkEmailProgress) => void): void {
    this.onProgress = callback;
  }

  /**
   * Set item complete callback
   */
  onItemCompleted(callback: (item: EmailQueueItem, completion: EmailQueueItemCompletion) => void): void {
    this.onItemComplete = callback;
  }

  /**
   * Clear the queue
   */
  async clear(refundPending = false): Promise<void> {
    await this.pause();
    if (this.workerPromise) await this.workerPromise;
    if (refundPending) {
      for (const item of this.queue.items) {
        if (item.status !== 'pending') continue;
        item.status = 'failed';
        if (item.quotaRefundSafe !== false) {
          item.lastError = 'PROVIDER_REJECTED: Queue cancelled before dispatch';
        }
        this.completeItem(item);
      }
    }
    this.queue.items = [];
    this.queue.processed = 0;
    this.queue.failed = 0;
  }

  /**
   * Check if queue is processing
   */
  isProcessing(): boolean {
    return this.queue.status === 'processing';
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.items.length;
  }

  getRetainedAttachmentBytes(): number {
    return this.queue.items.reduce(
      (total, item) =>
        total +
        (item.attachmentBytes || 0) +
        (item.attachments?.reduce(
          (itemTotal, attachment) => {
            const content = attachment.content;
            if (typeof content === 'string') return itemTotal + Buffer.byteLength(content);
            return itemTotal + (content ? content.length : 0);
          },
          0
        ) || 0),
      0
    );
  }

  /**
   * Fails items left mid-send by an interrupted host. Their outcome is
   * unknown, so they are neither retried nor refunded.
   */
  recoverInterruptedSends(): number {
    let recovered = 0;
    for (const item of this.queue.items) {
      if (item.status !== 'sending') continue;
      item.status = 'failed';
      item.quotaRefundSafe = false;
      item.lastError = 'Delivery outcome unknown: the queue was interrupted while sending';
      this.queue.failed++;
      this.completeItem(item);
      recovered++;
    }
    if (recovered > 0 && this.queue.status === 'processing') this.scheduleWorker(0);
    return recovered;
  }

  serialize(): SerializedEmailQueue {
    return {
      status: this.queue.status,
      processed: this.queue.processed,
      failed: this.queue.failed,
      lastActivity: this.lastActivity,
      items: this.queue.items.map(item => {
        // Attachment content is never serialised; hosts store it separately.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { attachments, createdAt, sentAt, nextRetryAt, quotaReservationDay, ...rest } = item;
        return {
          ...rest,
          createdAt: createdAt.toISOString(),
          sentAt: sentAt?.toISOString(),
          nextRetryAt: nextRetryAt?.toISOString(),
          quotaReservationDay: quotaReservationDay?.toISOString()
        };
      })
    };
  }

  static restore(
    provider: EmailProvider,
    state: SerializedEmailQueue,
    options: EmailQueueManagerOptions = {}
  ): EmailQueueManager {
    const manager = new EmailQueueManager(provider, options);
    manager.queue.status = state.status;
    manager.queue.processed = state.processed;
    manager.queue.failed = state.failed;
    manager.lastActivity = state.lastActivity;
    manager.queue.items = state.items.map(item => ({
      ...item,
      createdAt: new Date(item.createdAt),
      sentAt: toDate(item.sentAt),
      nextRetryAt: toDate(item.nextRetryAt),
      quotaReservationDay: toDate(item.quotaReservationDay)
    }));
    return manager;
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): number {
    return this.lastActivity;
  }

  /**
   * Get full status including rate limit info
   */
  getStatus(): {
    status: 'idle' | 'processing' | 'paused' | 'completed';
    processed: number;
    failed: number;
    total: number;
    remaining: number;
    provider: string;
    rateLimit: {
      limit: number;
      remaining: number;
      resetIn: number;
    };
    currentEmail?: string;
    currentIndex?: number;
    failedEmails?: { email: string; error: string }[];
  } {
    const remaining = this.queue.items.filter(i => i.status === 'pending').length;
    const resetIn = Math.max(0, this.queue.rateLimit.reset.getTime() - Date.now());
    const sendingItem = this.queue.items.find(i => i.status === 'sending');
    const sendingIndex = sendingItem ? this.queue.items.indexOf(sendingItem) : undefined;

    // Get list of failed emails with their error messages
    const failedEmails = this.queue.items
      .filter(i => i.status === 'failed')
      .map(i => ({
        email: formatRecipients(i.to),
        error: publicProviderError(i.lastError)
      }));

    return {
      status: this.queue.status,
      processed: this.queue.processed,
      failed: this.queue.failed,
      total: this.queue.items.length,
      remaining,
      provider: this.queue.provider,
      rateLimit: {
        limit: this.queue.rateLimit.limit,
        remaining: this.queue.rateLimit.remaining,
        resetIn
      },
      currentEmail: sendingItem?.to ? formatRecipients(sendingItem.to) : undefined,
      currentIndex: sendingIndex,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    };
  }
}
