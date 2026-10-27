/** @jest-environment node */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import type { PrismaClient } from '@prisma/client';
import httpMocks from 'node-mocks-http';

jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ user: { id: 'fixture' } }) }));

describe('project ordering in native SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'project-order-'));
  const previousUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient;
  let projects: typeof import('@/pages/api/projects/index').default;
  let project: typeof import('@/pages/api/projects/[id]').default;
  beforeAll(async () => {
    process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
    execFileSync('node_modules/.bin/prisma', ['db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' });
    prisma = require('@/lib/server/prisma').default;
    projects = require('@/pages/api/projects/index').default;
    project = require('@/pages/api/projects/[id]').default;
    await prisma.user.create({ data: { id: 'fixture', tier: 'plus', tierSource: 'manual' } });
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    rmSync(directory, { recursive: true, force: true });
  });

  it('lists the most recently edited project first across legacy and atomic creates', async () => {
    const legacy = await prisma.project.create({ data: { ownerId: 'fixture', name: 'Legacy', data: {},
      createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01') } });
    const ids = [legacy.id];
    for (const name of ['Older', 'Newer']) {
      const res = httpMocks.createResponse();
      await projects(httpMocks.createRequest({ method: 'POST', body: { name, data: {} } }), res);
      expect(res.statusCode).toBe(201);
      ids.push(res._getJSONData().project.id);
    }
    for (const id of [ids[1], legacy.id]) {
      await new Promise(resolve => setTimeout(resolve, 20));
      const updated = httpMocks.createResponse();
      await project(httpMocks.createRequest({ method: 'PUT', query: { id }, body: { data: { edited: true } } }), updated);
      expect(updated.statusCode).toBe(200);
      const listed = httpMocks.createResponse();
      await projects(httpMocks.createRequest({ method: 'GET' }), listed);
      expect(listed._getJSONData().projects[0].id).toBe(id);
      const reloaded = httpMocks.createResponse();
      await project(httpMocks.createRequest({ method: 'GET', query: { id } }), reloaded);
      expect(reloaded._getJSONData().project.data).toEqual({ edited: true });
    }
  });
});
