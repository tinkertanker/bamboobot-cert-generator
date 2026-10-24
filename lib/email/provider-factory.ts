import { ResendProvider } from './providers/resend';
import { SESProvider } from './providers/ses';
import type { EmailProvider } from './types';
import { PreviewEmailProvider } from './providers/preview';
import { isWorkers } from '@/lib/server/cloudflare';

let cachedProvider: EmailProvider | null = null;

/**
 * Get the configured email provider
 * Priority: SES > Resend
 */
export function getEmailProvider(): EmailProvider {
  // Explicit staging mode wins even if mail credentials were accidentally bound.
  if (isWorkers && process.env.EMAIL_DELIVERY_MODE === 'preview') return new PreviewEmailProvider();
  if (cachedProvider) {
    return cachedProvider;
  }

  // Check SES first (preferred for high volume)
  const sesProvider = new SESProvider();
  if (sesProvider.isConfigured()) {
    console.log('Using Amazon SES email provider');
    cachedProvider = sesProvider;
    return sesProvider;
  }

  // Fall back to Resend
  const resendProvider = new ResendProvider();
  if (resendProvider.isConfigured()) {
    console.log('Using Resend email provider');
    cachedProvider = resendProvider;
    return resendProvider;
  }

  throw new Error(
    'No email provider configured. Please set either AWS SES credentials or RESEND_API_KEY in environment variables.'
  );
}
