/** @jest-environment node */
import httpMocks from 'node-mocks-http';

jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/server/prisma', () => ({
  __esModule: true,
  default: { user: { update: jest.fn(() => Promise.resolve()) } },
}));

import { requireAuth } from '@/lib/auth/requireAuth';

const { getToken } = require('next-auth/jwt');
const { getServerSession } = require('next-auth/next');
const prisma = require('@/lib/server/prisma').default;

describe('requireAuth', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.update.mockResolvedValue({});
  });

  it('returns the token user id', async () => {
    getToken.mockResolvedValue({ uid: 'user-1', sub: 'user-1', email: 'a@example.com' });
    const res = httpMocks.createResponse();
    const session = await requireAuth(httpMocks.createRequest() as any, res as any);
    expect(session?.user.id).toBe('user-1');
  });

  it('falls back to token.sub when uid is missing', async () => {
    getToken.mockResolvedValue({ sub: 'user-2' });
    const res = httpMocks.createResponse();
    const session = await requireAuth(httpMocks.createRequest() as any, res as any);
    expect(session?.user.id).toBe('user-2');
  });

  it('rejects a token without a usable user id instead of returning an unscoped session', async () => {
    getToken.mockResolvedValue({ email: 'a@example.com', uid: '', sub: undefined });
    const res = httpMocks.createResponse();
    const session = await requireAuth(httpMocks.createRequest() as any, res as any);
    expect(session).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a server session without a user id', async () => {
    getToken.mockResolvedValue(null);
    getServerSession.mockResolvedValue({ user: { email: 'a@example.com' } });
    const res = httpMocks.createResponse();
    const session = await requireAuth(httpMocks.createRequest() as any, res as any);
    expect(session).toBeNull();
    expect(res.statusCode).toBe(401);
  });
});
