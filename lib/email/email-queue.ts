import { v4 as uuidv4 } from 'uuid';
import type {
  EmailQueue,
  EmailQueueItem,
  EmailParams,
  BulkEmailProgress,
  EmailProvider
} from './types';

export class EmailQueueManager {
  private queue: EmailQueue;
  private provider: EmailProvider;
  private processInterval: NodeJS.Timeout | null = null;
  private onProgress?: (progress: BulkEmailProgress) => void;
  private onItemComplete?: (item: EmailQueueItem) => void;
  private lastActivity: number = Date.now();

  constructor(provider: EmailProvider) {
    this.provider = provider;
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
  async addToQueue(emails: (EmailParams & { certificateUrl?: string })[]): Promise<void> {
    const newItems: EmailQueueItem[] = emails.map(email => ({
      id: uuidv4(),
      to: email.to,
      from: email.from,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
      certificateUrl: email.certificateUrl,
      status: 'pending',
      attempts: 0,
      createdAt: new Date()
    }));

    this.queue.items.push(...newItems);
    this.lastActivity = Date.now();
  }

  /**
   * Start processing the queue
   */
  async processQueue(): Promise<void> {
    if (this.queue.status === 'processing') {
      console.log('Queue already processing');
      return;
    }

    this.queue.status = 'processing';
    this.lastActivity = Date.now();
    await this._processQueue();
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    this.queue.status = 'paused';
    this.lastActivity = Date.now();
    if (this.processInterval) {
      clearTimeout(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    if (this.queue.status !== 'paused') {
      return;
    }
    this.queue.status = 'processing';
    this.lastActivity = Date.now();
    await this._processQueue();
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
    const pendingItemIndex = this.queue.items.findIndex(item => 
      item.status === 'pending' && 
      (!item.nextRetryAt || item.nextRetryAt <= new Date())
    );
    const pendingItem = pendingItemIndex >= 0 ? this.queue.items[pendingItemIndex] : null;
    
    if (!pendingItem) {
      // Check if there are items waiting for retry
      const waitingItems = this.queue.items.filter(item => 
        item.status === 'pending' && item.nextRetryAt && item.nextRetryAt > new Date()
      );
      
      if (waitingItems.length > 0) {
        // Find the next retry time and schedule processing
        const nextRetryTimes = waitingItems
          .map(item => item.nextRetryAt!)
          .sort((a, b) => a.getTime() - b.getTime());
        const nextRetryTime = nextRetryTimes[0];
        const waitTime = nextRetryTime.getTime() - Date.now();
        
        console.log(`All pending items are waiting for retry. Next retry in ${waitTime}ms`);
        this.processInterval = setTimeout(() => {
          this._processQueue();
        }, waitTime);
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
        this.processInterval = setTimeout(() => {
          this._processQueue();
        }, waitTime);
        return;
      }
    }

    // Process the item
    pendingItem.status = 'sending';
    pendingItem.attempts++;
    
    // Update current email in status
    this.reportProgress(pendingItem.to, pendingItemIndex);
    
    try {
      await this.sendEmail(pendingItem);
      pendingItem.status = 'sent';
      pendingItem.sentAt = new Date();
      this.queue.processed++;
      
      // Mark as emailed in R2 if using cloud storage
      if (pendingItem.certificateUrl && 
          (pendingItem.certificateUrl.includes('r2.cloudflarestorage.com') ||
           pendingItem.certificateUrl.includes('r2-public'))) {
        try {
          await fetch('/api/mark-emailed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUrl: pendingItem.certificateUrl })
          });
        } catch (error) {
          console.warn('Failed to mark file as emailed:', error);
        }
      }
      
      if (this.onItemComplete) {
        this.onItemComplete(pendingItem);
      }
    } catch (error) {
      console.error(`Failed to send email to ${pendingItem.to}:`, error);
      pendingItem.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a rate limit error
      const isRateLimitError = pendingItem.lastError?.toLowerCase().includes('rate limit');
      
      // Retry logic with exponential backoff
      if (pendingItem.attempts < 3 && !isRateLimitError) {
        pendingItem.status = 'pending'; // Will retry
        
        // Set next retry time with exponential backoff
        const retryDelay = this.calculateRetryDelay(pendingItem.attempts);
        pendingItem.nextRetryAt = new Date(Date.now() + retryDelay);
        
        console.log(`Email to ${pendingItem.to} failed (attempt ${pendingItem.attempts}). Next retry in ${retryDelay}ms`);
      } else {
        pendingItem.status = 'failed';
        this.queue.failed++;
        
        console.log(`Email to ${pendingItem.to} permanently failed after ${pendingItem.attempts} attempts`);
        
        // If rate limit error, pause the queue
        if (isRateLimitError) {
          console.log('Rate limit hit, pausing queue');
          await this.pause();
        }
      }
    }

    // Report progress
    this.reportProgress();

    // Schedule next item processing
    const delay = this.getProcessingDelay();
    this.processInterval = setTimeout(() => {
      this._processQueue();
    }, delay);
    
    this.lastActivity = Date.now();
  }

  /**
   * Send individual email
   */
  private async sendEmail(item: EmailQueueItem): Promise<void> {
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
    
    const estimatedTimeRemaining = remaining * this.getProcessingDelay() / 1000; // in seconds

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
  onItemCompleted(callback: (item: EmailQueueItem) => void): void {
    this.onItemComplete = callback;
  }


  /**
   * Clear the queue
   */
  async clear(): Promise<void> {
    await this.pause();
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
  } {
    const remaining = this.queue.items.filter(i => i.status === 'pending').length;
    const resetIn = Math.max(0, this.queue.rateLimit.reset.getTime() - Date.now());
    const sendingItem = this.queue.items.find(i => i.status === 'sending');
    const sendingIndex = sendingItem ? this.queue.items.indexOf(sendingItem) : undefined;
    
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
      currentEmail: sendingItem?.to,
      currentIndex: sendingIndex
    };
  }
}