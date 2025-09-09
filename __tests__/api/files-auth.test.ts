jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
import handlerTemp from '@/pages/api/files/temp_images/[...path]';
import handlerGen from '@/pages/api/files/generated/[...path]';
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

  it('enforces user prefix for temp images', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    // Wrong user prefix
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_other', 'img.jpg'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });

  it('serves temp image for correct user', async () => {
    const fsMod: any = require('fs');
    if (fsMod.default?.existsSync) fsMod.default.existsSync.mockReturnValue(true);
    if (fsMod.existsSync) fsMod.existsSync.mockReturnValue(true);
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['u_u1', 'img.jpg'] } });
    const res = httpMocks.createResponse();
    await handlerTemp(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res._getBuffer()).toBeInstanceOf(Buffer);
  });
});
