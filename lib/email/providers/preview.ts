import { randomUUID } from 'crypto';
import { cloudflare } from '@/lib/server/cloudflare';
import type { EmailParams, EmailProvider, EmailResult } from '@/lib/email/types';
import { withWorkerProviderCapacity } from '@/lib/email/worker-provider';

/** Staging delivery sink: records private previews, never contacts a mail service. */
export class PreviewEmailProvider implements EmailProvider {
  name = 'preview' as const;
  isConfigured() { return true; }
  getRateLimit() { return { limit: 2, remaining: 2, reset: new Date(Date.now() + 1000), window: 'second' as const }; }
  async sendEmail(params: EmailParams): Promise<EmailResult> {
    return withWorkerProviderCapacity(this.name, 1, 2, async () => {
      const id = randomUUID();
      await cloudflare().env.FILES.put(`mail-preview/${id}.json`, JSON.stringify({
        ...params, attachments: params.attachments?.map(a => ({ ...a,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        })), previewOnly: true, createdAt: new Date().toISOString(),
      }), { httpMetadata: { contentType: 'application/json' } });
      return { id, provider: this.name, success: true };
    });
  }
}
