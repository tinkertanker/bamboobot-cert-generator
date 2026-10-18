import crypto from 'crypto';
import { secretMatches } from '@/lib/storage/cleanup-handler';

/**
 * Requests the Worker sends to itself (from the email queue Durable Object)
 * carry a key derived from NEXTAUTH_SECRET. They have no user session.
 */
export const INTERNAL_KEY_HEADER = 'x-internal-key';

export function getInternalRequestKey(): string | null {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update('bamboobot-internal-request-v1').digest('hex');
}

export function isInternalRequestKey(provided: string | string[] | null | undefined): boolean {
  const expected = getInternalRequestKey();
  if (!expected || provided === null || provided === undefined) return false;
  return secretMatches(provided, expected);
}
