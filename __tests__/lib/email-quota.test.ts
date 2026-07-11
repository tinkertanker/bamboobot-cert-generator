jest.mock('@/lib/server/prisma', () => ({
  __esModule: true,
  prisma: {
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    user: {
      updateMany: jest.fn(),
      findUnique: jest.fn()
    }
  },
  default: {
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    user: {
      updateMany: jest.fn(),
      findUnique: jest.fn()
    }
  }
}));

import { prisma } from '@/lib/server/prisma';
import { checkEmailUsageAvailability, releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';

const user = prisma.user as unknown as {
  updateMany: jest.Mock;
  findUnique: jest.Mock;
};

describe('atomic email quota reservation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reserves the actual recipient count with an atomic limit predicate', async () => {
    const accountingEpoch = new Date('2026-07-11T00:00:00Z');
    user.updateMany
      .mockResolvedValueOnce({ count: 0 }) // no daily reset needed
      .mockResolvedValueOnce({ count: 1 });
    user.findUnique.mockResolvedValue({ tier: 'plus', dailyEmailCount: 95, lastUsageReset: accountingEpoch });

    const result = await reserveEmailUsage('u1', 5);

    expect(result).toMatchObject({ allowed: true, limit: 100, current: 100, reservationDay: accountingEpoch });
    expect(user.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'u1', lastUsageReset: accountingEpoch, dailyEmailCount: { lte: 95 } },
      data: {
        dailyEmailCount: { increment: 5 },
        lifetimeEmailCount: { increment: 5 }
      }
    });
  });

  it('denies a reservation when another request consumed the remaining quota', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    user.findUnique
      .mockResolvedValueOnce({ tier: 'plus', dailyEmailCount: 99 })
      .mockResolvedValueOnce({ dailyEmailCount: 100 });

    await expect(reserveEmailUsage('u1', 1)).resolves.toMatchObject({
      allowed: false,
      limit: 100,
      current: 100
    });
  });

  it('cannot reserve email quota for the free tier', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 });
    user.findUnique.mockResolvedValue({ tier: 'free', dailyEmailCount: 0 });

    await expect(reserveEmailUsage('u1', 1)).resolves.toMatchObject({
      allowed: false,
      limit: 0
    });
    expect(user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('preflights capacity without incrementing usage', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 });
    user.findUnique.mockResolvedValue({ tier: 'plus', dailyEmailCount: 99 });

    await expect(checkEmailUsageAvailability('u1', 2)).resolves.toMatchObject({
      allowed: false,
      limit: 100,
      current: 99
    });
    expect(user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('atomically compensates daily and lifetime counts after an unsent email', async () => {
    user.updateMany.mockResolvedValue({ count: 1 });
    const reservedAt = new Date('2026-07-11T23:59:30Z');

    await releaseEmailUsageReservation('u1', 2, reservedAt);

    expect(user.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'u1',
        dailyEmailCount: { gte: 2 },
        lastUsageReset: {
          gte: new Date('2026-07-11T00:00:00Z'),
          lt: new Date('2026-07-12T00:00:00Z')
        }
      },
      data: { dailyEmailCount: { decrement: 2 } }
    });
    expect(user.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'u1', lifetimeEmailCount: { gte: 2 } },
      data: { lifetimeEmailCount: { decrement: 2 } }
    });
  });
});
