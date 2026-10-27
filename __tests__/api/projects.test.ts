jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
import handlerList from '@/pages/api/projects/index';
import handlerItem from '@/pages/api/projects/[id]';
import handlerImport from '@/pages/api/projects/import';
import httpMocks from 'node-mocks-http';

jest.mock('@/lib/server/tiers', () => ({ getRemainingProjectAllowance: jest.fn() }));
jest.mock('@/lib/server/project-admission', () => ({ createProjectWithinLimit: jest.fn() }));

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/server/prisma', () => ({
  __esModule: true,
  default: {
    project: {
      findMany: jest.fn(),
      create: jest.fn(),
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
const { getRemainingProjectAllowance } = require('@/lib/server/tiers');
const { createProjectWithinLimit } = require('@/lib/server/project-admission');

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

  it('does not mutate a project not owned by the user', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    prisma.project.update.mockRejectedValue({ code: 'P2025' });
    const req = httpMocks.createRequest({ method: 'PUT', query: { id: 'p1' }, body: { name: 'New', data: {} } });
    const res = httpMocks.createResponse();
    await handlerItem(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: 'p1', ownerId: 'u1' },
      data: { name: 'New', data: {} },
    });
  });

  it('returns the updated project after an owner-scoped update', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    prisma.project.update.mockResolvedValue({ id: 'p1', ownerId: 'u1', name: 'New', data: {} });
    const req = httpMocks.createRequest({ method: 'PUT', query: { id: 'p1' }, body: { name: 'New', data: {} } });
    const res = httpMocks.createResponse();

    await handlerItem(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData().project).toMatchObject({ id: 'p1', ownerId: 'u1', name: 'New' });
  });

  it('does not delete a project not owned by the user', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    prisma.project.delete.mockRejectedValue({ code: 'P2025' });
    const req = httpMocks.createRequest({ method: 'DELETE', query: { id: 'p1' } });
    const res = httpMocks.createResponse();

    await handlerItem(req as any, res as any);

    expect(res.statusCode).toBe(404);
    expect(prisma.project.delete).toHaveBeenCalledWith({
      where: { id: 'p1', ownerId: 'u1' },
    });
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  describe('project limits and input validation', () => {
    beforeEach(() => {
      requireAuth.mockResolvedValue({ user: { id: 'u1' } });
    });

    it('rejects creating a project beyond the tier limit', async () => {
      createProjectWithinLimit.mockResolvedValue(null);
      const req = httpMocks.createRequest({ method: 'POST', body: { name: 'Second', data: {} } });
      const res = httpMocks.createResponse();
      await handlerList(req as any, res as any);
      expect(res.statusCode).toBe(403);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('creates a project owned by the caller regardless of client-supplied owner fields', async () => {
      createProjectWithinLimit.mockResolvedValue({ project: { id: 'p1', name: 'A' }, created: true });
      const req = httpMocks.createRequest({
        method: 'POST',
        body: { name: ' A ', data: { x: 1 }, ownerId: 'someone-else', clientProjectId: { evil: true } },
      });
      const res = httpMocks.createResponse();
      await handlerList(req as any, res as any);
      expect(res.statusCode).toBe(201);
      expect(createProjectWithinLimit).toHaveBeenCalledWith('u1', {
        name: 'A',
        data: { x: 1 },
        clientProjectId: null,
      });
    });

    it('rejects non-object project data', async () => {
      const req = httpMocks.createRequest({ method: 'PUT', query: { id: 'p1' }, body: { data: 'str' } });
      const res = httpMocks.createResponse();
      await handlerItem(req as any, res as any);
      expect(res.statusCode).toBe(400);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('rejects imports that exceed the tier limit without creating anything', async () => {
      getRemainingProjectAllowance.mockResolvedValue(1);
      const req = httpMocks.createRequest({ method: 'POST', body: { projects: [{ name: 'a' }, { name: 'b' }] } });
      const res = httpMocks.createResponse();
      await handlerImport(req as any, res as any);
      expect(res.statusCode).toBe(403);
      expect(prisma.project.create).not.toHaveBeenCalled();
    });

    it('rejects oversized import batches', async () => {
      const projects = Array.from({ length: 101 }, (_, i) => ({ name: `p${i}` }));
      const req = httpMocks.createRequest({ method: 'POST', body: { projects } });
      const res = httpMocks.createResponse();
      await handlerImport(req as any, res as any);
      expect(res.statusCode).toBe(400);
    });

    it('keeps project data when retrying a duplicate-name import', async () => {
      getRemainingProjectAllowance.mockResolvedValue(null);
      createProjectWithinLimit.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValue({ project: { id: 'p2' }, created: true });
      const req = httpMocks.createRequest({
        method: 'POST',
        body: { projects: [{ id: 'local-1', name: 'Dup', tableData: [{ a: 1 }] }] },
      });
      const res = httpMocks.createResponse();
      await handlerImport(req as any, res as any);
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({ imported: 1, importedIds: ['local-1'] });
      const retry = createProjectWithinLimit.mock.calls[1][1];
      expect(retry.name).toMatch(/^Dup \(Imported /);
      expect(retry.data).toEqual({ id: 'local-1', name: 'Dup', tableData: [{ a: 1 }] });
      expect(retry.clientProjectId).toBe('local-1');
    });

    it('confirms projects an earlier import already saved without creating them again', async () => {
      getRemainingProjectAllowance.mockResolvedValue(1);
      prisma.project.findFirst.mockImplementation(async ({ where }: any) =>
        where.clientProjectId === 'local-1' ? { id: 'srv-1' } : null
      );
      createProjectWithinLimit.mockResolvedValue({ project: { id: 'srv-2' }, created: true });
      const req = httpMocks.createRequest({
        method: 'POST',
        body: { projects: [{ id: 'local-1', name: 'Old' }, { id: 'local-2', name: 'New' }] },
      });
      const res = httpMocks.createResponse();
      await handlerImport(req as any, res as any);
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({ imported: 1, importedIds: ['local-1', 'local-2'] });
      expect(createProjectWithinLimit).toHaveBeenCalledTimes(1);
      expect(createProjectWithinLimit.mock.calls[0][1].clientProjectId).toBe('local-2');
    });
  });
});
