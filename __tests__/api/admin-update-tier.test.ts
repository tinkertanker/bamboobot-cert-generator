/** @jest-environment node */
import httpMocks from 'node-mocks-http';

let actor: { id: string; tier: string };

jest.mock('@/lib/server/middleware/featureGate', () => ({
  withAdminAccess: (handler: any) => (req: any, res: any) => {
    req.user = actor;
    return handler(req, res);
  },
}));
jest.mock('@/lib/server/tiers', () => ({ setUserTier: jest.fn() }));
jest.mock('@/lib/server/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));

import handler from '@/pages/api/admin/users/update-tier';

const { setUserTier } = require('@/lib/server/tiers');
const { prisma } = require('@/lib/server/prisma');

async function call(body: Record<string, unknown>) {
  const req = httpMocks.createRequest({ method: 'POST', body });
  const res = httpMocks.createResponse();
  await handler(req as any, res as any);
  return res;
}

describe('POST /api/admin/users/update-tier', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    setUserTier.mockImplementation(async (_a: string, id: string, tier: string) => ({ id, email: null, tier }));
  });

  it('does not let an admin grant admin access', async () => {
    actor = { id: 'admin-1', tier: 'admin' };
    prisma.user.findUnique.mockResolvedValue({ tier: 'free' });
    const res = await call({ userId: 'victim', tier: 'admin' });
    expect(res.statusCode).toBe(403);
    expect(setUserTier).not.toHaveBeenCalled();
  });

  it('does not let an admin demote a super admin', async () => {
    actor = { id: 'admin-1', tier: 'admin' };
    prisma.user.findUnique.mockResolvedValue({ tier: 'super_admin' });
    const res = await call({ userId: 'owner', tier: 'free' });
    expect(res.statusCode).toBe(403);
    expect(setUserTier).not.toHaveBeenCalled();
  });

  it('lets an admin upgrade a free user to plus', async () => {
    actor = { id: 'admin-1', tier: 'admin' };
    prisma.user.findUnique.mockResolvedValue({ tier: 'free' });
    const res = await call({ userId: 'u2', tier: 'plus' });
    expect(res.statusCode).toBe(200);
    expect(setUserTier).toHaveBeenCalledWith('admin-1', 'u2', 'plus', false);
  });

  it('lets a super admin grant admin access', async () => {
    actor = { id: 'sa-1', tier: 'super_admin' };
    prisma.user.findUnique.mockResolvedValue({ tier: 'plus' });
    const res = await call({ userId: 'u2', tier: 'admin' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects non-string user ids', async () => {
    actor = { id: 'sa-1', tier: 'super_admin' };
    const res = await call({ userId: { not: 'x' }, tier: 'plus' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown users', async () => {
    actor = { id: 'sa-1', tier: 'super_admin' };
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await call({ userId: 'missing', tier: 'plus' });
    expect(res.statusCode).toBe(404);
  });
});
