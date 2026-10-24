import { cloudflare } from '@/lib/server/cloudflare';
import type { EmailProvider, EmailResult } from '@/lib/email/types';
import { isProviderBackpressureError, providerRetryAfterSeconds } from '@/lib/email/provider-errors';

/** One atomic provider window across every isolate, queue and single/test route. */
export async function withWorkerProviderCapacity(provider: EmailProvider['name'], units: number, limit: number,
  send: () => Promise<EmailResult>): Promise<EmailResult> {
  const db = cloudflare().env.DB;
  const now = Date.now();
  const window = Math.floor(now / 1000);
  const admitted = units <= limit && await db.prepare(`
    INSERT INTO EmailProviderWindow(id,window,used) VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET window=excluded.window,
      used=CASE WHEN window=excluded.window THEN used+excluded.used ELSE excluded.used END
    WHERE cooldownUntil<=? AND (window!=excluded.window OR used+excluded.used<=?) RETURNING id
  `).bind(provider, window, units, now, limit).first();
  if (!admitted) return { id: '', provider, success: false, error: 'PROVIDER_BUSY: retry after 1000ms' };
  const result = await send();
  if (isProviderBackpressureError(result.error)) {
    await db.prepare('UPDATE EmailProviderWindow SET cooldownUntil=max(cooldownUntil,?) WHERE id=?')
      .bind(Date.now() + providerRetryAfterSeconds(result.error) * 1000, provider).run();
  }
  return result;
}
