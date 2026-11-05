/** @jest-environment node */
import { readFileSync } from 'fs';
import httpMocks from 'node-mocks-http';
import prisma from '@/lib/server/prisma';
import projects from '@/pages/api/projects/index';
import { fixtureTimestamp, projectSummaryFixtures } from '../helpers/project-summary-fixtures';

let context: any;
jest.mock('@/lib/server/cloudflare', () => ({ cloudflare: () => context, isWorkers: true }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ user: { id: 'owner' } }) }));

describe('project list summaries in real D1', () => {
  let mf: any;
  beforeAll(async () => {
    const { Miniflare } = require('miniflare');
    mf = new Miniflare({ workers: [{ config: {
      name: 'project-summaries', compatibilityDate: '2026-10-19',
      manifest: { mainModule: 'index.js', modules: { 'index.js': {
        type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
      } } },
      env: { DB: { type: 'd1', id: 'project-summaries' } },
    }, dev: { unsafeRegisterWorker: false } }] });
    const db = await mf.getD1Database('DB', 'project-summaries');
    context = { env: { DB: db } };
    let statement = '';
    for (const line of readFileSync('prisma/d1-migrations/0001_initial.sql', 'utf8').split('\n')) {
      if (!line.trim() || line.trim().startsWith('--')) continue;
      statement += `${line}\n`;
      if (line.trim().endsWith(';')) { await db.prepare(statement).run(); statement = ''; }
    }
    await db.prepare(`INSERT INTO User(id,tier,lastUsageReset) VALUES ('owner','free',?),('other','free',?)`)
      .bind(new Date().toISOString(), new Date().toISOString()).run();
  }, 30000);
  afterAll(async () => { await mf?.dispose(); });

  it('derives summaries and timestamps identically to the native SQLite route', async () => {
    for (const [index, fixture] of projectSummaryFixtures.entries()) {
      await prisma.project.create({ data: { ownerId: 'owner', name: fixture.name, data: fixture.data as object,
        createdAt: fixtureTimestamp(index), updatedAt: fixtureTimestamp(index) } });
    }
    await prisma.project.create({ data: { ownerId: 'other', name: 'Not mine', data: {} } });
    const listed = httpMocks.createResponse();
    await projects(httpMocks.createRequest({ method: 'GET' }) as any, listed as any);
    expect(listed.statusCode).toBe(200);
    expect(listed._getJSONData().projects.map(({ id, ...rest }: { id: string }) => rest)).toEqual(
      projectSummaryFixtures.map((fixture, index) => ({ name: fixture.name, ...fixture.summary,
        createdAt: fixtureTimestamp(index).toISOString(), updatedAt: fixtureTimestamp(index).toISOString() })).reverse());
  });
});
