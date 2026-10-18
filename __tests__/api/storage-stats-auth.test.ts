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

import handler from '@/pages/api/storage-stats';
import httpMocks from 'node-mocks-http';
import type { RequestMethod } from 'node-mocks-http';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const { getServerSession } = require('next-auth');
const { detectUserTier } = require('@/lib/server/tiers');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REQUIRE_AUTH = process.env.REQUIRE_AUTH;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true, enumerable: true });
}

function run(method: RequestMethod = 'GET') {
  const req = httpMocks.createRequest({ method });
  const res = httpMocks.createResponse();
  return handler(req as any, res as any).then(() => res);
}

describe('storage-stats authentication', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.REQUIRE_AUTH;
    ({ bucket } = installCloudflareEnv());
    bucket.seed('generated/u_1/individual_1/a.pdf', 'aaaa');
    bucket.seed('generated/u_1/individual_1/b.pdf', 'bb');
    bucket.seed('generated/certificates_1.pdf', 'c');
    bucket.seed('temp_images/u_1/t.png', 'ttt');
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
  });

  it('rejects a non-super-admin in production with 403', async () => {
    setNodeEnv('production');
    getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'user@example.com' } });
    detectUserTier.mockReturnValue('free');
    const res = await run();
    expect(res.statusCode).toBe(403);
  });

  it('requires a session outside development even when auth is not enforced', async () => {
    setNodeEnv('test');
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
  });

  it('requires a session in development when auth is enforced (REQUIRE_AUTH=true)', async () => {
    setNodeEnv('development');
    process.env.REQUIRE_AUTH = 'true';
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
  });

  it('allows the open development mode (auth not enforced) so the dev StorageMonitor works', async () => {
    setNodeEnv('development');
    delete process.env.REQUIRE_AUTH;
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('summarises R2 usage by first-level entry', async () => {
    setNodeEnv('development');
    const res = await run();
    expect(res.statusCode).toBe(200);
    const body = res._getJSONData();
    expect(body.totalSize).toBe(10);
    expect(body.directories.generated).toMatchObject({ path: 'generated/', totalSize: 7, fileCount: 2 });
    expect(body.directories.generated.files).toEqual([
      expect.objectContaining({ name: 'u_1', size: 6, type: 'folder' }),
      expect.objectContaining({ name: 'certificates_1.pdf', size: 1, type: 'pdf' }),
    ]);
    expect(body.directories.tempImages).toMatchObject({ totalSize: 3, fileCount: 1 });
  });

  it('rejects non-GET methods', async () => {
    setNodeEnv('development');
    const res = await run('POST');
    expect(res.statusCode).toBe(405);
  });
});
