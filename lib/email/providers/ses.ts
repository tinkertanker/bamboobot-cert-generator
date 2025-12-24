import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import type { EmailParams, EmailResult, RateLimitInfo, EmailProvider } from '../types';
import { promises as fs } from 'fs';

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

      let response;

      // Use SendRawEmailCommand if attachments are present
      if (params.attachments && params.attachments.length > 0) {
        const rawMessage = await this.buildRawEmailMessage(params);
        const command = new SendRawEmailCommand({
          Source: params.from,
          Destinations: params.to,
          RawMessage: {
            Data: Buffer.from(rawMessage)
          }
        });
        response = await this.client.send(command);
      } else {
        // Use simple SendEmailCommand for text/html only emails
        const emailParams = {
          Source: params.from,
          Destination: {
            ToAddresses: params.to
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
              },
              ...(params.text && {
                Text: {
                  Data: params.text,
                  Charset: 'UTF-8'
                }
              })
            }
          }
        };

        const command = new SendEmailCommand(emailParams);
        response = await this.client.send(command);
      }

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

  /**
   * Build raw MIME email message with attachments
   */
  private async buildRawEmailMessage(params: EmailParams): Promise<string> {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    let message = '';

    // Headers
    message += `From: ${params.from}\r\n`;
    message += `To: ${params.to.join(', ')}\r\n`;
    message += `Subject: ${params.subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

    // Body part (text/html)
    message += `--${boundary}\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;

    // Text part
    if (params.text) {
      message += `--${altBoundary}\r\n`;
      message += `Content-Type: text/plain; charset=UTF-8\r\n`;
      message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
      message += `${params.text}\r\n\r\n`;
    }

    // HTML part
    message += `--${altBoundary}\r\n`;
    message += `Content-Type: text/html; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    message += `${params.html}\r\n\r\n`;
    message += `--${altBoundary}--\r\n`;

    // Attachments
    if (params.attachments) {
      for (const attachment of params.attachments) {
        let attachmentData: Buffer;

        // Get attachment content
        if (attachment.content) {
          attachmentData = Buffer.isBuffer(attachment.content) 
            ? attachment.content 
            : Buffer.from(attachment.content);
        } else if (attachment.path) {
          // Handle file path - fetch content
          try {
            if (attachment.path.startsWith('http')) {
              // URL - fetch from web
              const response = await fetch(attachment.path);
              const arrayBuffer = await response.arrayBuffer();
              attachmentData = Buffer.from(arrayBuffer);
            } else {
              // Local file path
              attachmentData = await fs.readFile(attachment.path);
            }
          } catch (error) {
            console.error(`Failed to read attachment ${attachment.filename}:`, error);
            continue; // Skip this attachment
          }
        } else {
          console.warn(`Attachment ${attachment.filename} has no content or path`);
          continue;
        }

        // Add attachment to message
        message += `--${boundary}\r\n`;
        message += `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
        
        // Encode attachment as base64 with line breaks
        const base64Data = attachmentData.toString('base64');
        for (let i = 0; i < base64Data.length; i += 76) {
          message += base64Data.slice(i, i + 76) + '\r\n';
        }
        message += '\r\n';
      }
    }

    // End boundary
    message += `--${boundary}--\r\n`;

    return message;
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