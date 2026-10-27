/** @jest-environment node */
jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('next-auth', () => ({ __esModule: true, default: jest.fn(() => jest.fn()), getServerSession: jest.fn() }));
jest.mock('@/lib/server/tiers', () => ({ detectUserTier: jest.fn() }));

import handler from '@/pages/api/dev-cleanup';
import httpMocks from 'node-mocks-http';
import type { Body, RequestMethod } from 'node-mocks-http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { getServerSession } = require('next-auth');
const { detectUserTier } = require('@/lib/server/tiers');

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_REQUIRE_AUTH = process.env.REQUIRE_AUTH;
const ORIGINAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR;

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true, writable: true, enumerable: true });
}

function run(method: RequestMethod = 'POST', body: Body = { target: 'temp' }) {
  const req = httpMocks.createRequest({ method, body });
  const res = httpMocks.createResponse();
  return handler(req as any, res as any).then(() => res);
}

describe('dev-cleanup authentication', () => {
  let storageDir: string;
  let disposableFile: string;
  let retainedFile: string;

  it('preserves protected agent jobs while deleting disposable generated files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csv7-cleanup-'));
    const previous = process.env.LOCAL_STORAGE_DIR;
    process.env.LOCAL_STORAGE_DIR = root;
    setNodeEnv('development');
    try {
      fs.mkdirSync(path.join(root, 'generated/agent_jobs/other-owner'), { recursive: true });
      fs.writeFileSync(path.join(root, 'generated/agent_jobs/other-owner/sample.pdf'), 'protected');
      fs.writeFileSync(path.join(root, 'generated/disposable.pdf'), 'disposable');
      const res = await run('POST', { target: 'generated' });
      expect(res.statusCode).toBe(200);
      expect(fs.readFileSync(path.join(root, 'generated/agent_jobs/other-owner/sample.pdf'), 'utf8')).toBe('protected');
      expect(fs.existsSync(path.join(root, 'generated/disposable.pdf'))).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.LOCAL_STORAGE_DIR;
      else process.env.LOCAL_STORAGE_DIR = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.REQUIRE_AUTH;
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-cleanup-auth-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    disposableFile = path.join(storageDir, 'temp_images', 'u_test', 'delete.png');
    retainedFile = path.join(storageDir, 'generated', 'keep.pdf');
    fs.mkdirSync(path.dirname(disposableFile), { recursive: true });
    fs.mkdirSync(path.dirname(retainedFile), { recursive: true });
    fs.writeFileSync(disposableFile, 'disposable image');
    fs.writeFileSync(retainedFile, 'retained certificate');
  });

  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
    if (ORIGINAL_STORAGE_DIR === undefined) delete process.env.LOCAL_STORAGE_DIR;
    else process.env.LOCAL_STORAGE_DIR = ORIGINAL_STORAGE_DIR;
    Object.defineProperty(process.env, 'NODE_ENV', { value: ORIGINAL_NODE_ENV, configurable: true, writable: true, enumerable: true });
    if (ORIGINAL_REQUIRE_AUTH === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = ORIGINAL_REQUIRE_AUTH;
  });

  function expectPreserved() {
    expect(fs.readFileSync(disposableFile, 'utf8')).toBe('disposable image');
    expect(fs.readFileSync(retainedFile, 'utf8')).toBe('retained certificate');
  }

  function expectCleaned(res: Awaited<ReturnType<typeof run>>) {
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, deletedFiles: 1, freedSpace: 16 });
    expect(fs.existsSync(disposableFile)).toBe(false);
    expect(fs.readFileSync(retainedFile, 'utf8')).toBe('retained certificate');
  }

  it('rejects unauthenticated requests in production with 401', async () => {
    setNodeEnv('production');
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
    expect(detectUserTier).not.toHaveBeenCalled();
    expectPreserved();
  });

  it('rejects a non-super-admin session in production with 403', async () => {
    setNodeEnv('production');
    getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'user@example.com' } });
    detectUserTier.mockReturnValue('free');
    const res = await run();
    expect(res.statusCode).toBe(403);
    expectPreserved();
  });

  it('requires a session outside development even when auth is not enforced (e.g. test env)', async () => {
    setNodeEnv('test');
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
    expectPreserved();
  });

  it('requires a session in development when auth is explicitly enforced (REQUIRE_AUTH=true)', async () => {
    setNodeEnv('development');
    process.env.REQUIRE_AUTH = 'true';
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
    expectPreserved();
  });

  it('allows an authenticated non-admin session in development with auth enforced', async () => {
    setNodeEnv('development');
    process.env.REQUIRE_AUTH = 'true';
    getServerSession.mockResolvedValue({ user: { id: 'u1', email: 'dev@example.com' } });
    detectUserTier.mockReturnValue('free');
    const res = await run();
    expectCleaned(res);
  });

  it('allows the open development mode (auth not enforced) so the dev StorageMonitor works', async () => {
    setNodeEnv('development');
    delete process.env.REQUIRE_AUTH; // default dev: isAuthenticationRequired() === false
    getServerSession.mockResolvedValue(null);
    const res = await run();
    expectCleaned(res);
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods', async () => {
    setNodeEnv('development');
    const res = await run('GET');
    expect(res.statusCode).toBe(405);
    expectPreserved();
  });
});
