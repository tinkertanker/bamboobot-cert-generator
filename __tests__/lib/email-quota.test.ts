jest.mock('@/lib/server/prisma', () => ({
  __esModule: true,
  prisma: {
    user: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
  default: {
    user: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/server/prisma';
import { checkEmailUsageAvailability, reserveEmailUsage } from '@/lib/server/tiers';

const user = prisma.user as unknown as {
  updateMany: jest.Mock;
  findUnique: jest.Mock;
};

describe('atomic email quota reservation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reserves the actual recipient count with an atomic limit predicate', async () => {
    user.updateMany
      .mockResolvedValueOnce({ count: 0 }) // no daily reset needed
      .mockResolvedValueOnce({ count: 1 });
    user.findUnique.mockResolvedValue({ tier: 'plus', dailyEmailCount: 95 });

    const result = await reserveEmailUsage('u1', 5);

    expect(result).toMatchObject({ allowed: true, limit: 100, current: 100 });
    expect(user.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'u1', dailyEmailCount: { lte: 95 } },
      data: {
        dailyEmailCount: { increment: 5 },
        lifetimeEmailCount: { increment: 5 },
      },
    });
  });

  it('denies a reservation when another request consumed the remaining quota', async () => {
    user.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    user.findUnique
      .mockResolvedValueOnce({ tier: 'plus', dailyEmailCount: 99 })
      .mockResolvedValueOnce({ dailyEmailCount: 100 });

    await expect(reserveEmailUsage('u1', 1)).resolves.toMatchObject({
      allowed: false,
      limit: 100,
      current: 100,
    });
  });

  it('cannot reserve email quota for the free tier', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 });
    user.findUnique.mockResolvedValue({ tier: 'free', dailyEmailCount: 0 });

    await expect(reserveEmailUsage('u1', 1)).resolves.toMatchObject({
      allowed: false,
      limit: 0,
    });
    expect(user.updateMany).toHaveBeenCalledTimes(1);
  });

  it('preflights capacity without incrementing usage', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 });
    user.findUnique.mockResolvedValue({ tier: 'plus', dailyEmailCount: 99 });

    await expect(checkEmailUsageAvailability('u1', 2)).resolves.toMatchObject({
      allowed: false,
      limit: 100,
      current: 99,
    });
    expect(user.updateMany).toHaveBeenCalledTimes(1);
  });
});
