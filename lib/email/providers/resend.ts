import type { EmailParams, EmailResult, RateLimitInfo, EmailProvider } from '../types';
import { providerRejectedError } from '../provider-errors';

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

export class ResendProvider implements EmailProvider {
  name = 'resend' as const;
  private apiKey: string | null = null;
  private request: typeof fetch = (...args) => fetch(...args);
  private sendTail: Promise<void> = Promise.resolve();
  private pendingSends = 0;
  private rateLimit: RateLimitInfo = {
    limit: 2,
    remaining: 2,
    reset: new Date(Date.now() + 1000),
    window: 'second'
  };

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.apiKey = process.env.RESEND_API_KEY;
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async sendEmail(params: EmailParams): Promise<EmailResult> {
    if (this.pendingSends >= getMaxPendingSends()) {
      return {
        id: '',
        success: false,
        error: 'PROVIDER_BUSY: retry shortly',
        provider: 'resend'
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
          provider: 'resend'
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
    if (!this.apiKey) {
      return {
        id: '',
        success: false,
        error: providerRejectedError('Resend API key not configured'),
        provider: 'resend'
      };
    }

    let dispatched = false;
    try {
      // Update rate limit tracking
      if (this.rateLimit.remaining <= 0) {
        const now = new Date();
        if (now < this.rateLimit.reset) {
          return {
            id: '',
            success: false,
            error: `PROVIDER_BUSY: retry after ${this.rateLimit.reset.getTime() - now.getTime()}ms`,
            provider: 'resend'
          };
        }
        const resetAt = new Date();
        this.rateLimit.remaining = this.rateLimit.limit;
        this.rateLimit.reset = new Date(resetAt.getTime() + 1000);
      }

      if (signal.aborted) {
        return { id: '', success: false, error: 'PROVIDER_BUSY: timed out before dispatch', provider: 'resend' };
      }
      dispatched = true;
      const response = await this.request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          text: params.text,
          attachments: params.attachments?.map(att => ({
            filename: att.filename,
            content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
            content_type: att.contentType
          }))
        }),
        signal
      });
      if (response.status === 429) {
        await response.body?.cancel().catch(() => undefined);
        const retryAfter = Number.parseFloat(response.headers?.get('retry-after') || '1');
        const retryAfterMs = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter * 1000, 1000), 60_000) : 1000;
        this.rateLimit.remaining = 0;
        this.rateLimit.reset = new Date(Date.now() + retryAfterMs);
        return {
          id: '',
          success: false,
          error: `PROVIDER_CAPACITY: retry after ${retryAfterMs}ms`,
          provider: 'resend'
        };
      }
      if (!response.ok) {
        let message = `Resend rejected the email (${response.status})`;
        try {
          const errorBody = (await response.json()) as { message?: string };
          if (errorBody.message) message = errorBody.message;
        } catch {
          // Keep the status-based error when the provider body is not JSON.
        }
        const isDefinitiveClientRejection =
          response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status);
        return {
          id: '',
          success: false,
          // Timeout-like, conflict, too-early, and server responses may arrive
          // after acceptance, so keep those outcomes ambiguous and charged.
          error: isDefinitiveClientRejection ? providerRejectedError(message) : message,
          provider: 'resend'
        };
      }
      const responseBody = (await response.json()) as { id?: string };

      // Decrement rate limit
      this.rateLimit.remaining--;

      return {
        id: responseBody.id || '',
        success: true,
        provider: 'resend'
      };
    } catch (error) {
      console.error('Resend email error:', error);
      return {
        id: '',
        success: false,
        error: !dispatched
          ? providerRejectedError(error instanceof Error ? error.message : 'Invalid email request')
          : error instanceof Error
            ? error.message
            : 'Unknown error',
        provider: 'resend'
      };
    }
  }

  getRateLimit(): RateLimitInfo {
    // Check if we need to reset
    const now = new Date();
    if (now >= this.rateLimit.reset) {
      this.rateLimit.remaining = this.rateLimit.limit;
      this.rateLimit.reset = new Date(now.getTime() + 1000);
    }

    return { ...this.rateLimit };
  }
}
