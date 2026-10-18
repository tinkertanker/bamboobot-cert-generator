/** @jest-environment node */
jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => jest.fn()), getServerSession: jest.fn() }));
jest.mock('@/lib/server/tiers', () => ({ detectUserTier: jest.fn() }));
jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import handler from '@/pages/api/dev-cleanup';
import httpMocks from 'node-mocks-http';
import type { Body, RequestMethod } from 'node-mocks-http';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const { getServerSession } = require('next-auth');
const { detectUserTier } = require('@/lib/server/tiers');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REQUIRE_AUTH = process.env.REQUIRE_AUTH;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true, enumerable: true });
}

function run(method: RequestMethod = 'POST', body: Body = { target: 'temp' }) {
  const req = httpMocks.createRequest({ method, body });
  const res = httpMocks.createResponse();
  return handler(req as any, res as any).then(() => res);
}

describe('dev-cleanup authentication', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.REQUIRE_AUTH;
    ({ bucket } = installCloudflareEnv());
    bucket.seed('temp_images/u_1/a.png', 'png');
    bucket.seed('generated/u_1/b.pdf', '%PDF');
  });

  afterEach(() => resetCloudflareEnv());

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
    expect(bucket.objects.size).toBe(2);
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

  it('deletes only the targeted prefix from R2', async () => {
    setNodeEnv('development');
    const res = await run('POST', { target: 'temp' });
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, deletedFiles: 1 });
    expect([...bucket.objects.keys()]).toEqual(['generated/u_1/b.pdf']);
  });

  it('rejects an unknown target', async () => {
    setNodeEnv('development');
    const res = await run('POST', { target: 'everything' });
    expect(res.statusCode).toBe(400);
    expect(bucket.objects.size).toBe(2);
  });

  it('rejects non-POST methods', async () => {
    setNodeEnv('development');
    const res = await run('GET');
    expect(res.statusCode).toBe(405);
  });
});
