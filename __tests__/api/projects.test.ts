jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
import handlerList from '@/pages/api/projects/index';
import handlerItem from '@/pages/api/projects/[id]';
import httpMocks from 'node-mocks-http';

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/server/prisma', () => ({
  __esModule: true,
  default: {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const { getServerSession } = require('next-auth/next');
const prisma = require('@/lib/server/prisma').default;
const { requireAuth } = require('@/lib/auth/requireAuth');

describe('projects API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns 401 when not authenticated (list)', async () => {
    requireAuth.mockImplementation(async (_req: any, res: any) => { res.status(401).json({ message: 'Unauthorized' }); return null; });
    const req = httpMocks.createRequest({ method: 'GET' });
    const res = httpMocks.createResponse();
    await handlerList(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it('lists projects and maps counts from data', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    prisma.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'A', createdAt: '2025-01-01', updatedAt: '2025-01-02', data: { columns: ['x','y'], tableData: [{x:'1',y:'2'}], emailConfig: { isConfigured: true }, certificateImage: { url: '/temp_images/u_u1/a.jpg' } }},
      { id: 'p2', name: 'B', createdAt: '2025-01-03', updatedAt: '2025-01-04', data: { positions: { Name: {} }, tableData: [], certificateImage: {} }},
    ]);
    const req = httpMocks.createRequest({ method: 'GET' });
    const res = httpMocks.createResponse();
    await handlerList(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const json = res._getJSONData();
    expect(json.projects[0]).toMatchObject({ columnsCount: 2, rowsCount: 1, hasEmailConfig: true, imageStatus: 'available' });
    expect(json.projects[1]).toMatchObject({ columnsCount: 1, rowsCount: 0 });
  });

  it('prevents updating a project not owned by user', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    prisma.project.update.mockResolvedValue({ id: 'p1', ownerId: 'other', name: 'N', data: {} });
    const req = httpMocks.createRequest({ method: 'PUT', query: { id: 'p1' }, body: { name: 'New', data: {} } });
    const res = httpMocks.createResponse();
    await handlerItem(req as any, res as any);
    expect(res.statusCode).toBe(403);
  });
});
