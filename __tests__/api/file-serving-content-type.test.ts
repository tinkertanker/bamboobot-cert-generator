jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: { isR2Enabled: false, isS3Enabled: false },
}));
jest.mock('@/lib/r2-client', () => ({ getPublicUrl: jest.fn() }));
jest.mock('@/lib/s3-client', () => ({ getS3SignedUrl: jest.fn() }));
jest.mock('fs', () => ({
  __esModule: true,
  default: {
    readFileSync: jest.fn(() => Buffer.from('<script>alert(1)</script>')),
    existsSync: jest.fn(() => true),
  },
  readFileSync: jest.fn(() => Buffer.from('<script>alert(1)</script>')),
  existsSync: jest.fn(() => true),
}));

import httpMocks from 'node-mocks-http';
import handlerTemp from '@/pages/api/files/temp_images/[...path]';
import handlerGen from '@/pages/api/files/generated/[...path]';

describe('private file serving content types', () => {
  it.each([
    ['temp_images', handlerTemp, 'evil.html'],
    ['temp_images', handlerTemp, 'evil.svg'],
    ['temp_images', handlerTemp, 'noextension'],
    ['generated', handlerGen, 'evil.html'],
    ['generated', handlerGen, 'evil.svg'],
  ])('%s refuses to serve %s', async (_route, handler, filename) => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', filename] } });
    const res = httpMocks.createResponse();
    await handler(req as never, res as never);
    expect(res.statusCode).toBe(404);
    expect(res._getData()).not.toContain('<script>');
  });

  it.each([
    ['temp_images', handlerTemp, 'cert.png', 'image/png'],
    ['temp_images', handlerTemp, 'cert.JPG', 'image/jpeg'],
    ['temp_images', handlerTemp, 'cert.pdf', 'application/pdf'],
    ['generated', handlerGen, 'certificates_1.pdf', 'application/pdf'],
  ])('%s serves %s as %s with nosniff', async (_route, handler, filename, type) => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', filename] } });
    const res = httpMocks.createResponse();
    await handler(req as never, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Content-Type')).toBe(type);
    expect(res.getHeader('X-Content-Type-Options')).toBe('nosniff');
  });

  it('rejects null bytes in path segments', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'a\0.png'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as never, res as never);
    expect(res.statusCode).toBe(403);
  });
});
