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
  async addToQueue(emails: EmailParams[]): Promise<void> {
    const newItems: EmailQueueItem[] = emails.map(email => ({
      id: uuidv4(),
      to: email.to,
      from: email.from,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
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
   * Process the queue respecting rate limits
   */
  private async _processQueue(): Promise<void> {
    if (this.queue.status !== 'processing') {
      return;
    }

    // Update rate limit info
    this.queue.rateLimit = this.provider.getRateLimit();

    // Find next pending item
    const pendingItem = this.queue.items.find(item => item.status === 'pending');
    
    if (!pendingItem) {
      // No more items to process
      this.queue.status = 'idle';
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
    
    try {
      await this.sendEmail(pendingItem);
      pendingItem.status = 'sent';
      pendingItem.sentAt = new Date();
      this.queue.processed++;
      
      if (this.onItemComplete) {
        this.onItemComplete(pendingItem);
      }
    } catch (error) {
      console.error(`Failed to send email to ${pendingItem.to}:`, error);
      pendingItem.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      // Retry logic
      if (pendingItem.attempts < 3) {
        pendingItem.status = 'pending'; // Will retry
      } else {
        pendingItem.status = 'failed';
        this.queue.failed++;
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
          This link will expire in 24 hours. Please download your certificate promptly.
        </p>
      </div>
    `;
    
    const text = `Your Certificate is Ready!\n\nDownload your certificate here: ${downloadUrl}\n\nThis link will expire in 24 hours.`;
    
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
      // Resend: spread over the hour
      return 3600000 / this.queue.rateLimit.limit; // ~36 seconds between emails for 100/hour
    }
  }

  /**
   * Report progress
   */
  private reportProgress(): void {
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
      estimatedTimeRemaining
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
    status: 'idle' | 'processing' | 'paused';
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
  } {
    const remaining = this.queue.items.filter(i => i.status === 'pending').length;
    const resetIn = Math.max(0, this.queue.rateLimit.reset.getTime() - Date.now());
    
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
      }
    };
  }
}