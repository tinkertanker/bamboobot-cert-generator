/** @jest-environment node */
jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => jest.fn()), getServerSession: jest.fn() }));
jest.mock('@/lib/server/tiers', () => ({ detectUserTier: jest.fn() }));

import handler from '@/pages/api/dev-cleanup';
import httpMocks from 'node-mocks-http';

const { getServerSession } = require('next-auth');
const { detectUserTier } = require('@/lib/server/tiers');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REQUIRE_AUTH = process.env.REQUIRE_AUTH;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true, enumerable: true });
}

function run(method = 'POST', body: unknown = { target: 'temp' }) {
  const req = httpMocks.createRequest({ method, body });
  const res = httpMocks.createResponse();
  return handler(req as any, res as any).then(() => res);
}

describe('dev-cleanup authentication', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.REQUIRE_AUTH;
  });

  afterAll(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: ORIGINAL_NODE_ENV, configurable: true, writable: true, enumerable: true });
    if (ORIGINAL_REQUIRE_AUTH === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = ORIGINAL_REQUIRE_AUTH;
  });

  it('rejects unauthenticated requests in production with 401', async () => {
    setNodeEnv('production');
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
    expect(detectUserTier).not.toHaveBeenCalled();
  });

  it('rejects a non-super-admin session in production with 403', async () => {
    setNodeEnv('production');
    getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'user@example.com' } });
    detectUserTier.mockReturnValue('free');
    const res = await run();
    expect(res.statusCode).toBe(403);
  });

  it('requires a session outside development even when auth is not enforced (e.g. test env)', async () => {
    setNodeEnv('test');
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
  });

  it('requires a session in development when auth is explicitly enforced (REQUIRE_AUTH=true)', async () => {
    setNodeEnv('development');
    process.env.REQUIRE_AUTH = 'true';
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
  });

  it('allows an authenticated non-admin session in development with auth enforced', async () => {
    setNodeEnv('development');
    process.env.REQUIRE_AUTH = 'true';
    getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'dev@example.com' } });
    detectUserTier.mockReturnValue('free');
    const res = await run();
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('allows the open development mode (auth not enforced) so the dev StorageMonitor works', async () => {
    setNodeEnv('development');
    delete process.env.REQUIRE_AUTH; // default dev: isAuthenticationRequired() === false
    getServerSession.mockResolvedValue(null);
    const res = await run();
    // No session required in open dev mode; must not be blocked by auth.
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods', async () => {
    setNodeEnv('development');
    const res = await run('GET');
    expect(res.statusCode).toBe(405);
  });
});
