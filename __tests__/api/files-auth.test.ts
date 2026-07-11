jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: { isR2Enabled: true, isS3Enabled: false },
}));
jest.mock('@/lib/r2-client', () => ({ getPublicUrl: jest.fn(async () => 'https://bucket.example/file') }));
import handlerTemp from '@/pages/api/files/temp_images/[...path]';
import handlerGen from '@/pages/api/files/generated/[...path]';
import handlerTempFlat from '@/pages/api/files/temp_images/[filename]';
import handlerGenFlat from '@/pages/api/files/generated/[filename]';
import handlerTemplate from '@/pages/api/files/template_images/[filename]';
import httpMocks from 'node-mocks-http';

jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
const { getServerSession } = require('next-auth/next');
const { requireAuth } = require('@/lib/auth/requireAuth');

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    readFileSync: jest.fn(() => Buffer.from('pdf')),
    existsSync: jest.fn(() => true),
  },
  readFileSync: jest.fn(() => Buffer.from('pdf')),
  existsSync: jest.fn(() => true),
}));

describe('file serving auth', () => {
  beforeEach(() => jest.resetAllMocks());

  it('requires auth for generated files', async () => {
    requireAuth.mockImplementation(async (_req: any, res: any) => { res.status(401).json({ message: 'Unauthorized' }); return null; });
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['foo.pdf'] } });
    const res = httpMocks.createResponse();
    await handlerGen(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('rejects another user generated-file namespace', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['u_other', 'session', 'foo.pdf'] },
    });
    const res = httpMocks.createResponse();

    await handlerGen(req as any, res as any);

    expect(res.statusCode).toBe(403);
  });

  it('does not serve unscoped legacy generated filenames', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = httpMocks.createRequest({ method: 'GET', query: { filename: 'foo.pdf' } });
    const res = httpMocks.createResponse();

    await handlerGenFlat(req as any, res as any);

    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['flat generated files', handlerGenFlat, { filename: 'foo.pdf' }],
    ['flat temporary images', handlerTempFlat, { filename: 'foo.jpg' }],
    ['template images', handlerTemplate, { filename: 'foo.jpg' }],
  ])('requires auth for %s', async (_name, handler, query) => {
    requireAuth.mockImplementation(async (_req: any, res: any) => {
      res.status(401).json({ message: 'Unauthorized' });
      return null;
    });
    const req = httpMocks.createRequest({ method: 'GET', query });
    const res = httpMocks.createResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
  });

  it('enforces user prefix for temp images', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    // Wrong user prefix
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_other', 'img.jpg'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it('serves the same-origin local temp image in cloud mode when available', async () => {
    const fsMod: any = require('fs');
    if (fsMod.default?.existsSync) fsMod.default.existsSync.mockReturnValue(true);
    if (fsMod.existsSync) fsMod.existsSync.mockReturnValue(true);
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'img.jpg'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Location')).toBeUndefined();
    expect(res._getBuffer()).toBeInstanceOf(Buffer);
  });

  it('rejects traversal after a valid user prefix', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['u_u1', '..', '..', 'temp_images-elsewhere', 'img.jpg'] },
    });
    const res = httpMocks.createResponse();

    await handlerTemp(req as any, res as any);

    expect(res.statusCode).toBe(403);
  });
});
