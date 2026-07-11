import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import type { EmailParams, EmailResult, RateLimitInfo, EmailProvider } from '../types';
import { providerRejectedError } from '../provider-errors';
import {
  assertPdfBuffer,
  getMaxPdfSourceBytes,
  loadTrustedPdf,
  PdfSourceError,
  sanitizePdfFilename
} from '@/lib/security/trusted-pdf-source';

function assertSafeMimeHeader(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field} email header`);
  }
}

function getSendTimeoutMs(): number {
  const configured = Number.parseInt(process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return 30_000;
  return Math.min(configured, 120_000);
}

function getMaxPendingSends(): number {
  const configured = Number.parseInt(process.env.MAX_PENDING_EMAIL_PROVIDER_SENDS || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return 8;
  return Math.min(configured, 100);
}

export class SESProvider implements EmailProvider {
  name = 'ses' as const;
  private client: SESClient | null = null;
  private sendTail: Promise<void> = Promise.resolve();
  private pendingSends = 0;
  private rateLimit: RateLimitInfo = {
    limit: 14, // Default SES sandbox limit per second
    remaining: 14,
    reset: new Date(Date.now() + 1000), // 1 second from now
    window: 'second'
  };

  constructor() {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SES_REGION) {
      this.client = new SESClient({
        region: process.env.AWS_SES_REGION,
        // The queue owns retries. SendEmail is not idempotent, so an SDK retry
        // after a lost success response can create duplicate delivery.
        maxAttempts: 1,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });

      // Adjust rate limit based on environment
      // Production accounts typically have higher limits
      if (process.env.AWS_SES_RATE_LIMIT) {
        const configuredRate = Number.parseInt(process.env.AWS_SES_RATE_LIMIT, 10);
        if (Number.isSafeInteger(configuredRate) && configuredRate > 0) {
          this.rateLimit.limit = Math.min(configuredRate, 1000);
          this.rateLimit.remaining = this.rateLimit.limit;
        }
      }
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  async sendEmail(params: EmailParams): Promise<EmailResult> {
    if (this.pendingSends >= getMaxPendingSends()) {
      return {
        id: '',
        success: false,
        error: 'PROVIDER_BUSY: retry shortly',
        provider: 'ses'
      };
    }
    this.pendingSends += 1;
    const previous = this.sendTail;
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.sendTail = previous.then(
      () => current,
      () => current
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getSendTimeoutMs());
    timeout.unref?.();
    try {
      const acquired = await Promise.race([
        previous.then(
          () => true,
          () => true
        ),
        new Promise<boolean>(resolve => {
          controller.signal.addEventListener('abort', () => resolve(false), { once: true });
        })
      ]);
      if (!acquired) {
        return {
          id: '',
          success: false,
          error: 'PROVIDER_BUSY: timed out waiting to send',
          provider: 'ses'
        };
      }
      return await this.sendEmailLocked(params, controller.signal);
    } finally {
      clearTimeout(timeout);
      release();
      this.pendingSends -= 1;
    }
  }

  private async sendEmailLocked(params: EmailParams, signal: AbortSignal): Promise<EmailResult> {
    if (!this.client) {
      return {
        id: '',
        success: false,
        error: providerRejectedError('AWS SES not configured'),
        provider: 'ses'
      };
    }

    let dispatched = false;
    try {
      const requiredCapacity = params.to.length;
      if (requiredCapacity <= 0 || requiredCapacity > this.rateLimit.limit) {
        return {
          id: '',
          success: false,
          error: providerRejectedError('Recipient count exceeds the configured SES send rate'),
          provider: 'ses'
        };
      }
      // Update rate limit tracking
      if (this.rateLimit.remaining < requiredCapacity) {
        const now = new Date();
        if (now < this.rateLimit.reset) {
          return {
            id: '',
            success: false,
            error: `PROVIDER_BUSY: retry after ${this.rateLimit.reset.getTime() - now.getTime()}ms`,
            provider: 'ses'
          };
        }
        const resetAt = new Date();
        this.rateLimit.remaining = this.rateLimit.limit;
        this.rateLimit.reset = new Date(resetAt.getTime() + 1000);
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
        if (signal.aborted) {
          return { id: '', success: false, error: 'PROVIDER_BUSY: timed out before dispatch', provider: 'ses' };
        }
        dispatched = true;
        response = await this.client.send(command, { abortSignal: signal });
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
        if (signal.aborted) {
          return { id: '', success: false, error: 'PROVIDER_BUSY: timed out before dispatch', provider: 'ses' };
        }
        dispatched = true;
        response = await this.client.send(command, { abortSignal: signal });
      }

      // Decrement rate limit
      this.rateLimit.remaining -= requiredCapacity;

      return {
        id: response.MessageId || '',
        success: true,
        provider: 'ses'
      };
    } catch (error) {
      console.error('SES email error:', error);
      const errorName = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isExplicitRejection =
        /^(MessageRejected|MailFromDomainNotVerified(?:Exception)?|AccountSendingPausedException|ConfigurationSetSendingPausedException|ConfigurationSetDoesNotExistException)$/i.test(
          errorName
        );
      const errorMetadata =
        typeof error === 'object' && error && '$metadata' in error && typeof error.$metadata === 'object'
          ? error.$metadata
          : null;
      const errorRetryable =
        typeof error === 'object' && error && '$retryable' in error && typeof error.$retryable === 'object'
          ? error.$retryable
          : null;
      // AWS messages can echo user-controlled identities. Classify only from
      // structured SDK fields so text such as "throttled.user@example.com"
      // cannot poison the shared provider's capacity state.
      const isThrottled =
        !isExplicitRejection &&
        (/throttl|too.?many.?requests|limit.?exceeded/i.test(errorName) ||
          (errorMetadata && 'httpStatusCode' in errorMetadata && errorMetadata.httpStatusCode === 429) ||
          (errorRetryable && 'throttling' in errorRetryable && errorRetryable.throttling === true));
      if (isThrottled) {
        this.rateLimit.remaining = 0;
        this.rateLimit.reset = new Date(Date.now() + 1000);
      }
      return {
        id: '',
        success: false,
        error: isThrottled
          ? 'PROVIDER_CAPACITY: retry after 1000ms'
          : !dispatched || isExplicitRejection
            ? providerRejectedError(errorMessage)
            : errorMessage,
        provider: 'ses'
      };
    }
  }

  /**
   * Build raw MIME email message with attachments
   */
  private async buildRawEmailMessage(params: EmailParams): Promise<string> {
    assertSafeMimeHeader(params.from, 'From');
    assertSafeMimeHeader(params.subject, 'Subject');
    params.to.forEach(recipient => assertSafeMimeHeader(recipient, 'To'));

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
          if (typeof attachment.content !== 'string' && !Buffer.isBuffer(attachment.content)) {
            throw new PdfSourceError('INVALID_PDF', 'Invalid PDF attachment content', 400);
          }
          if (attachment.content.length > getMaxPdfSourceBytes()) {
            throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachment exceeds the size limit', 413);
          }
          attachmentData = Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content);
        } else if (attachment.path) {
          // Keep the provider safe even if a future caller bypasses the API
          // attachment builder and supplies a path directly.
          const loaded = await loadTrustedPdf(attachment.path);
          attachmentData = loaded.buffer;
        } else {
          console.warn(`Attachment ${attachment.filename} has no content or path`);
          continue;
        }

        if (attachmentData.length > getMaxPdfSourceBytes()) {
          throw new PdfSourceError('PDF_TOO_LARGE', 'PDF attachment exceeds the size limit', 413);
        }
        assertPdfBuffer(attachmentData);
        const filename = sanitizePdfFilename(attachment.filename, 'certificate.pdf');

        // Add attachment to message
        message += `--${boundary}\r\n`;
        message += `Content-Type: application/pdf; name="${filename}"\r\n`;
        message += `Content-Transfer-Encoding: base64\r\n`;
        message += `Content-Disposition: attachment; filename="${filename}"\r\n\r\n`;

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
