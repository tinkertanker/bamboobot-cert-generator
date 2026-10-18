import type { NextApiRequest, NextApiResponse } from 'next';
import { INTERNAL_KEY_HEADER, isInternalRequestKey } from '@/lib/server/internal-request';
import { releaseEmailUsageReservation } from '@/lib/server/tiers';

/**
 * Called only by the bulk email queue Durable Object to return quota for
 * emails that were definitely not sent. It carries no user session, so it
 * must present the internal request key.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isInternalRequestKey(req.headers[INTERNAL_KEY_HEADER])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { userId, refunds } = req.body ?? {};
  if (typeof userId !== 'string' || !userId || !Array.isArray(refunds) || refunds.length > 100) {
    res.status(400).json({ error: 'Invalid refund request' });
    return;
  }

  try {
    for (const refund of refunds) {
      const reservationDay = new Date(refund?.reservationDay);
      const recipientCount = refund?.recipientCount;
      if (Number.isNaN(reservationDay.getTime()) || !Number.isSafeInteger(recipientCount) || recipientCount <= 0) {
        continue;
      }
      await releaseEmailUsageReservation(userId, recipientCount, reservationDay);
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to release bulk email quota reservation:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
}
