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

  it('rejects empty replay identities without acknowledging discarded payloads', async () => {
    const importProjects = require('@/pages/api/projects/import').default;
    for (const clientProjectId of ['', '   ', 'x'.repeat(201)]) {
      for (const name of ['Alice', 'Bob']) {
        const res = httpMocks.createResponse();
        await projects(httpMocks.createRequest({ method: 'POST', body: { name, data: { recipient: name }, clientProjectId } }), res);
        expect(res.statusCode).toBe(400);
        const imported = httpMocks.createResponse();
        await importProjects(httpMocks.createRequest({ method: 'POST', body: { projects: [{ id: clientProjectId, name }] } }), imported);
        expect(imported.statusCode).toBe(400);
      }
    }
    expect(await prisma.project.count()).toBe(0);
    const ids = [];
    for (const name of ['Alice', 'Bob']) {
      const created = httpMocks.createResponse();
      const body = { name, data: { recipient: name }, clientProjectId: `local-${name}` };
      await projects(httpMocks.createRequest({ method: 'POST', body }), created);
      expect(created.statusCode).toBe(201);
      const id = created._getJSONData().project.id;
      ids.push(id);
      const replay = httpMocks.createResponse();
      await projects(httpMocks.createRequest({ method: 'POST', body }), replay);
      expect(replay.statusCode).toBe(200);
      expect(replay._getJSONData().project.id).toBe(id);
      const reloaded = httpMocks.createResponse();
      await project(httpMocks.createRequest({ method: 'GET', query: { id } }), reloaded);
      expect(reloaded._getJSONData().project.data).toEqual({ recipient: name });
    }
    expect(new Set(ids).size).toBe(2);
    expect(await prisma.project.count()).toBe(2);
    await prisma.project.deleteMany();
  });

  it('acknowledges only semantically identical POST replays, including concurrent conflicts', async () => {
    const post = async (name: string, data: object) => {
      const res = httpMocks.createResponse();
      await projects(httpMocks.createRequest({ method: 'POST', body: { name, data, clientProjectId: 'replay-contract' } }), res);
      return res;
    };
    try {
      const created = await post('Alice', { recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } });
      expect(created.statusCode).toBe(201);
      // Object key order is irrelevant, array order and value types are not.
      expect((await post('Alice', { options: { tags: ['a', 'b'], size: 12 }, recipient: 'Alice' })).statusCode).toBe(200);
      for (const [name, data] of [
        ['Alice', { recipient: 'Bob', options: { size: 12, tags: ['a', 'b'] } }],
        ['Carol', { recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } }],
        ['Alice', { recipient: 'Alice', options: { size: '12', tags: ['a', 'b'] } }],
        ['Alice', { recipient: 'Alice', options: { size: 12, tags: ['b', 'a'] } }],
      ] as const) expect((await post(name, data)).statusCode).toBe(409);
      const reloaded = httpMocks.createResponse();
      await project(httpMocks.createRequest({ method: 'GET', query: { id: created._getJSONData().project.id } }), reloaded);
      expect(reloaded._getJSONData().project.data).toEqual({ recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } });
      await prisma.project.deleteMany();
      const names = ['Concurrent Alice', 'Concurrent Bob'];
      const results: Array<{ statusCode: number }> = await Promise.all(names.map(name => post(name, { recipient: name })));
      expect(results.map(res => res.statusCode).sort()).toEqual([201, 409]);
      const winner = results.findIndex(res => res.statusCode === 201);
      expect(await prisma.project.findMany({ select: { name: true, data: true } }))
        .toEqual([{ name: names[winner], data: { recipient: names[winner] } }]);
    } finally { await prisma.project.deleteMany(); }
  });

  it('confirms import content, not just its ID, across batches, retries and concurrent requests', async () => {
    const importProjects = require('@/pages/api/projects/import').default;
    const alice = { id: 'import-replay', name: 'Alice', tableData: [{ Name: 'Alice' }], options: { size: 12, tags: ['a', 'b'] } };
    const post = async (inputs: object[]) => {
      const res = httpMocks.createResponse();
      await importProjects(httpMocks.createRequest({ method: 'POST', body: { projects: inputs } }), res);
      return res;
    };
    try {
      // A duplicate ID cannot ambiguously confirm two different browser copies.
      const batch = await post([alice, { ...alice, name: 'Bob' }]);
      expect(batch.statusCode).toBe(409);
      expect(batch._getJSONData().importedIds).toEqual([]);
      expect(await prisma.project.count()).toBe(0);

      expect((await post([alice, alice]))._getJSONData()).toEqual({ imported: 1, importedIds: [alice.id] });
      const equivalent = { options: { tags: ['a', 'b'], size: 12 }, tableData: [{ Name: 'Alice' }], name: 'Alice', id: alice.id };
      expect((await post([equivalent]))._getJSONData()).toEqual({ imported: 0, importedIds: [alice.id] });
      for (const changed of [
        { ...alice, name: 'Bob' },
        { ...alice, tableData: [{ Name: 'Bob' }] },
        { ...alice, options: { size: '12', tags: ['a', 'b'] } },
        { ...alice, options: { size: 12, tags: ['b', 'a'] } },
      ]) {
        const conflict = await post([changed]);
        expect(conflict.statusCode).toBe(409);
        expect(conflict._getJSONData().importedIds).not.toContain(alice.id);
      }
      expect(await prisma.project.findMany({ select: { data: true } })).toEqual([{ data: alice }]);

      // Retrying after a partially persisted request confirms its existing copy
      // and admits only the missing one, even when its display name needs a suffix.
      const second = { ...alice, id: 'second-import' };
      expect((await post([alice, second]))._getJSONData()).toEqual({ imported: 1, importedIds: [alice.id, second.id] });
      expect((await post([second]))._getJSONData()).toEqual({ imported: 0, importedIds: [second.id] });
      expect(await prisma.project.count()).toBe(2);

      await prisma.project.deleteMany();
      const inputs = [alice, { ...alice, name: 'Bob', tableData: [{ Name: 'Bob' }] }];
      const replies = await Promise.all(inputs.map(input => post([input])));
      expect(replies.map((res: { statusCode: number }) => res.statusCode).sort()).toEqual([200, 409]);
      const winner = replies.findIndex((res: { statusCode: number }) => res.statusCode === 200);
      expect(replies[1 - winner]._getJSONData().importedIds).not.toContain(alice.id);
      expect(await prisma.project.findMany({ select: { data: true } })).toEqual([{ data: inputs[winner] }]);
    } finally { await prisma.project.deleteMany(); }
  });

  it('counts equivalent batch IDs once against the remaining import capacity', async () => {
    const importProjects = require('@/pages/api/projects/import').default;
    await prisma.user.update({ where: { id: 'fixture' }, data: { tier: 'free' } });
    try {
      const input = { id: 'one-slot', name: 'Alice', tableData: [{ Name: 'Alice' }] };
      for (const imported of [1, 0]) {
        const res = httpMocks.createResponse();
        await importProjects(httpMocks.createRequest({ method: 'POST', body: { projects: [input, input] } }), res);
        expect(res.statusCode).toBe(200);
        expect(res._getJSONData()).toEqual({ imported, importedIds: [input.id] });
      }
      expect(await prisma.project.count()).toBe(1);
    } finally {
      await prisma.project.deleteMany();
      await prisma.user.update({ where: { id: 'fixture' }, data: { tier: 'plus' } });
    }
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
