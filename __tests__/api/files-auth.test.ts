/** @jest-environment node */
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import { EventEmitter } from 'events';
import httpMocks from 'node-mocks-http';
import handlerTemp from '@/pages/api/files/temp_images/[...path]';
import handlerGen from '@/pages/api/files/generated/[...path]';
import handlerTempFlat from '@/pages/api/files/temp_images/[filename]';
import handlerGenFlat from '@/pages/api/files/generated/[filename]';
import handlerTemplate from '@/pages/api/files/template_images/[filename]';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const { requireAuth } = require('@/lib/auth/requireAuth');

function denyAuth() {
  requireAuth.mockImplementation(async (_req: any, res: any) => {
    res.status(401).json({ message: 'Unauthorized' });
    return null;
  });
}

function response() {
  return httpMocks.createResponse({ eventEmitter: EventEmitter });
}

describe('file serving auth', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    jest.resetAllMocks();
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    ({ bucket } = installCloudflareEnv());
    bucket.seed('generated/u_other/session/foo.pdf', '%PDF other');
    bucket.seed('temp_images/u_other/img.jpg', 'other');
    bucket.seed('temp_images/u_u1/img.jpg', 'mine');
  });

  afterEach(() => resetCloudflareEnv());

  it('requires auth for generated files', async () => {
    denyAuth();
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'foo.pdf'] } });
    const res = response();
    await handlerGen(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('rejects another user generated-file namespace', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_other', 'session', 'foo.pdf'] } });
    const res = response();
    await handlerGen(req as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(res._getData()).not.toContain('other');
  });

  it('does not serve unscoped legacy generated filenames', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { filename: 'foo.pdf' } });
    const res = response();
    await handlerGenFlat(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['flat generated files', handlerGenFlat, { filename: 'foo.pdf' }],
    ['flat temporary images', handlerTempFlat, { filename: 'foo.jpg' }],
    ['template images', handlerTemplate, { filename: 'dev-mode-template.jpg' }],
  ])('requires auth for %s', async (_name, handler, query) => {
    denyAuth();
    const req = httpMocks.createRequest({ method: 'GET', query });
    const res = response();
    await handler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('enforces user prefix for temp images', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_other', 'img.jpg'] } });
    const res = response();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it("streams the user's own temp image from R2", async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'img.jpg'] } });
    const res = response();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Location')).toBeUndefined();
    expect(res._getBuffer().toString()).toBe('mine');
  });

  it('returns 404 for a missing temp image', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'missing.jpg'] } });
    const res = response();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });

  it('rejects traversal after a valid user prefix', async () => {
    const req = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['u_u1', '..', 'u_other', 'img.jpg'] },
    });
    const res = response();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it('serves only the dev-mode template from static assets', async () => {
    const allowed = httpMocks.createRequest({ method: 'GET', query: { filename: 'dev-mode-template.jpg' } });
    const allowedRes = response();
    await handlerTemplate(allowed as any, allowedRes as any);
    expect(allowedRes.statusCode).toBe(200);
    expect(allowedRes.getHeader('Content-Type')).toBe('image/jpeg');

    const other = httpMocks.createRequest({ method: 'GET', query: { filename: 'other.jpg' } });
    const otherRes = response();
    await handlerTemplate(other as any, otherRes as any);
    expect(otherRes.statusCode).toBe(404);

    const traversal = httpMocks.createRequest({ method: 'GET', query: { filename: '../fonts/x.ttf' } });
    const traversalRes = response();
    await handlerTemplate(traversal as any, traversalRes as any);
    expect(traversalRes.statusCode).toBe(400);
  });
});
