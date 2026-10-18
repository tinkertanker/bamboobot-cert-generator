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
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const ACTIVE_CONTENT = '<script>alert(1)</script>';

describe('private file serving content types', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
    for (const prefix of ['temp_images', 'generated']) {
      for (const name of ['evil.html', 'evil.svg', 'noextension', 'cert.png', 'cert.JPG', 'cert.pdf', 'certificates_1.pdf']) {
        bucket.seed(`${prefix}/u_u1/${name}`, ACTIVE_CONTENT, {}, 'text/html');
      }
    }
  });

  afterEach(() => resetCloudflareEnv());

  it.each([
    ['temp_images', handlerTemp, 'evil.html'],
    ['temp_images', handlerTemp, 'evil.svg'],
    ['temp_images', handlerTemp, 'noextension'],
    ['generated', handlerGen, 'evil.html'],
    ['generated', handlerGen, 'evil.svg'],
    ['generated', handlerGen, 'cert.png'],
  ])('%s refuses to serve %s', async (_route, handler, filename) => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', filename] } });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await handler(req as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res._getData()).not.toContain('<script>');
  });

  it.each([
    ['temp_images', handlerTemp, 'cert.png', 'image/png'],
    ['temp_images', handlerTemp, 'cert.JPG', 'image/jpeg'],
    ['temp_images', handlerTemp, 'cert.pdf', 'application/pdf'],
    ['generated', handlerGen, 'certificates_1.pdf', 'application/pdf'],
  ])('%s serves %s as %s with nosniff, ignoring the stored type', async (_route, handler, filename, type) => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', filename] } });
    const res = httpMocks.createResponse({ eventEmitter: EventEmitter });
    await handler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe(type);
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
  });

  it('rejects null bytes in path segments', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'a\0.png'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as never, res as never);
    expect(res.statusCode).toBe(403);
  });
});
