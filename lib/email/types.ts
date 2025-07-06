/**
 * Email provider types and interfaces
 */

export interface EmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface EmailResult {
  id: string;
  success: boolean;
  error?: string;
  provider: 'resend' | 'ses';
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  window: 'hour' | 'second' | 'day';
}

export interface EmailProvider {
  name: 'resend' | 'ses';
  sendEmail(params: EmailParams): Promise<EmailResult>;
  getRateLimit(): RateLimitInfo;
  isConfigured(): boolean;
}

export interface EmailQueueItem {
  id: string;
  to: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  certificateUrl?: string;
  certificatePath?: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: Date;
  sentAt?: Date;
  provider?: 'resend' | 'ses';
}

export interface EmailQueue {
  items: EmailQueueItem[];
  status: 'idle' | 'processing' | 'paused';
  processed: number;
  failed: number;
  provider: 'resend' | 'ses';
  rateLimit: RateLimitInfo;
}

export interface BulkEmailProgress {
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  estimatedTimeRemaining?: number; // in seconds
}