import { Resend } from 'resend';
import type { EmailParams, EmailResult, RateLimitInfo, EmailProvider } from '../types';

export class ResendProvider implements EmailProvider {
  name = 'resend' as const;
  private client: Resend | null = null;
  private rateLimit: RateLimitInfo = {
    limit: 100,
    remaining: 100,
    reset: new Date(Date.now() + 3600000), // 1 hour from now
    window: 'hour'
  };

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.client = new Resend(process.env.RESEND_API_KEY);
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async sendEmail(params: EmailParams): Promise<EmailResult> {
    if (!this.client) {
      return {
        id: '',
        success: false,
        error: 'Resend API key not configured',
        provider: 'resend'
      };
    }

    try {
      // Update rate limit tracking
      if (this.rateLimit.remaining <= 0) {
        const now = new Date();
        if (now < this.rateLimit.reset) {
          return {
            id: '',
            success: false,
            error: `Rate limit exceeded. Resets at ${this.rateLimit.reset.toISOString()}`,
            provider: 'resend'
          };
        } else {
          // Reset rate limit
          this.rateLimit.remaining = this.rateLimit.limit;
          this.rateLimit.reset = new Date(now.getTime() + 3600000);
        }
      }

      const response = await this.client.emails.send({
        from: params.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        attachments: params.attachments?.map(att => ({
          filename: att.filename,
          content: att.content as string | Buffer,
          content_type: att.contentType
        }))
      });

      // Decrement rate limit
      this.rateLimit.remaining--;

      return {
        id: response.id || '',
        success: true,
        provider: 'resend'
      };
    } catch (error) {
      console.error('Resend email error:', error);
      return {
        id: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'resend'
      };
    }
  }

  getRateLimit(): RateLimitInfo {
    // Check if we need to reset
    const now = new Date();
    if (now >= this.rateLimit.reset) {
      this.rateLimit.remaining = this.rateLimit.limit;
      this.rateLimit.reset = new Date(now.getTime() + 3600000);
    }
    
    return { ...this.rateLimit };
  }
}