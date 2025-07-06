import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailParams, EmailResult, RateLimitInfo, EmailProvider } from '../types';

export class SESProvider implements EmailProvider {
  name = 'ses' as const;
  private client: SESClient | null = null;
  private rateLimit: RateLimitInfo = {
    limit: 14, // Default SES sandbox limit per second
    remaining: 14,
    reset: new Date(Date.now() + 1000), // 1 second from now
    window: 'second'
  };

  constructor() {
    if (
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SES_REGION
    ) {
      this.client = new SESClient({
        region: process.env.AWS_SES_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });

      // Adjust rate limit based on environment
      // Production accounts typically have higher limits
      if (process.env.AWS_SES_RATE_LIMIT) {
        this.rateLimit.limit = parseInt(process.env.AWS_SES_RATE_LIMIT, 10);
        this.rateLimit.remaining = this.rateLimit.limit;
      }
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
        error: 'AWS SES not configured',
        provider: 'ses'
      };
    }

    try {
      // Update rate limit tracking
      if (this.rateLimit.remaining <= 0) {
        const now = new Date();
        if (now < this.rateLimit.reset) {
          const waitTime = this.rateLimit.reset.getTime() - now.getTime();
          return {
            id: '',
            success: false,
            error: `Rate limit exceeded. Wait ${waitTime}ms`,
            provider: 'ses'
          };
        } else {
          // Reset rate limit
          this.rateLimit.remaining = this.rateLimit.limit;
          this.rateLimit.reset = new Date(now.getTime() + 1000);
        }
      }

      // Build email parameters
      const emailParams = {
        Source: params.from,
        Destination: {
          ToAddresses: [params.to]
        },
        Message: {
          Subject: {
            Data: params.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: params.html,
              Charset: 'UTF-8'
            }
          }
        }
      };

      // Add text version if provided
      if (params.text) {
        emailParams.Message.Body.Text = {
          Data: params.text,
          Charset: 'UTF-8'
        };
      }

      const command = new SendEmailCommand(emailParams);
      const response = await this.client.send(command);

      // Decrement rate limit
      this.rateLimit.remaining--;

      return {
        id: response.MessageId || '',
        success: true,
        provider: 'ses'
      };
    } catch (error) {
      console.error('SES email error:', error);
      return {
        id: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: 'ses'
      };
    }
  }

  getRateLimit(): RateLimitInfo {
    // Check if we need to reset (per second for SES)
    const now = new Date();
    if (now >= this.rateLimit.reset) {
      this.rateLimit.remaining = this.rateLimit.limit;
      this.rateLimit.reset = new Date(now.getTime() + 1000);
    }
    
    return { ...this.rateLimit };
  }
}