/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { setImmediate as nodeSetImmediate } from 'timers';
import type { PrismaClient } from '@prisma/client';
import httpMocks from 'node-mocks-http';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ user: { id: 'migration-fixture' } }) }));

import { useProjectMigration, IMPORT_DECLINED_KEY } from '@/hooks/useProjectMigration';

const PREFIX = 'bamboobot_project_v1_';

function saveLocal(id: string, name = id) {
  localStorage.setItem(
    `${PREFIX}${id}`,
    JSON.stringify({
      id,
      name,
      created: '2026-01-01T00:00:00.000Z',
      lastModified: '2026-01-01T00:00:00.000Z',
      version: '1.0',
      positions: { Name: { x: 50, y: 50 } },
      columns: ['Name'],
      tableData: [{ Name: 'A' }],
      certificateImage: { url: '/api/files/a.png', filename: 'a.png', uploadedAt: '', isCloudStorage: false },
    })
  );
}

function mockImportResponse(status: number, body: unknown) {
  (global as any).fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

describe('useProjectMigration', () => {
  const originalFlag = process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE;

  beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = 'true';
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = originalFlag;
    delete (global as any).fetch;
  });

  it('does not offer an import when server storage is off', async () => {
    process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = 'false';
    saveLocal('a');
    mockImportResponse(200, {});
    renderHook(() => useProjectMigration());
    await new Promise(r => setTimeout(r, 0));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${PREFIX}a`)).not.toBeNull();
  });

  it('sends the browser projects and deletes only the ones the server confirms', async () => {
    saveLocal('a');
    saveLocal('b');
    mockImportResponse(200, { imported: 1, importedIds: ['a'] });
    renderHook(() => useProjectMigration());
    await waitFor(() => expect(window.alert).toHaveBeenCalled());

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.projects.map((p: any) => p.id).sort()).toEqual(['a', 'b']);
    expect(localStorage.getItem(`${PREFIX}a`)).toBeNull();
    expect(localStorage.getItem(`${PREFIX}b`)).not.toBeNull();
  });

  it('keeps every browser project when the import fails', async () => {
    saveLocal('a');
    mockImportResponse(403, { error: 'Project limit reached for your plan', importedIds: [] });
    renderHook(() => useProjectMigration());
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(localStorage.getItem(`${PREFIX}a`)).not.toBeNull();
  });

  it('remembers a declined import and does not ask again', async () => {
    saveLocal('a');
    mockImportResponse(200, {});
    (window.confirm as jest.Mock).mockReturnValue(false);
    const first = renderHook(() => useProjectMigration());
    await waitFor(() => expect(localStorage.getItem(IMPORT_DECLINED_KEY)).toBe('true'));
    first.unmount();

    (window.confirm as jest.Mock).mockClear();
    renderHook(() => useProjectMigration());
    await new Promise(r => setTimeout(r, 0));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${PREFIX}a`)).not.toBeNull();
  });
});

describe('migration confirmation through the real import route and SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'project-migration-'));
  const previousUrl = process.env.DATABASE_URL;
  const previousFlag = process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE;
  const previousFetch = global.fetch;
  let prisma: PrismaClient;
  let importProjects: typeof import('@/pages/api/projects/import').default;
  beforeAll(async () => {
    global.setImmediate = nodeSetImmediate;
    process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
    execFileSync('node_modules/.bin/prisma', ['db', 'push', '--skip-generate'], { env: process.env, stdio: 'pipe' });
    prisma = require('@/lib/server/prisma').default;
    importProjects = require('@/pages/api/projects/import').default;
    await prisma.user.create({ data: { id: 'migration-fixture', tier: 'plus', tierSource: 'manual' } });
  }, 30000);
  afterAll(async () => {
    await prisma?.$disconnect();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousFlag === undefined) delete process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE;
    else process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = previousFlag;
    global.fetch = previousFetch;
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps conflicting browser bytes and deletes only an equivalent confirmed retry', async () => {
    localStorage.clear();
    process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = 'true';
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    window.confirm = jest.fn(() => true);
    window.alert = jest.fn();
    saveLocal('shared', 'Alice');
    const alice = JSON.parse(localStorage.getItem(`${PREFIX}shared`)!);
    await prisma.project.create({ data: { ownerId: 'migration-fixture', clientProjectId: 'shared', name: 'Alice', data: alice } });
    saveLocal('shared', 'Bob');
    const bobBytes = localStorage.getItem(`${PREFIX}shared`);
    const responses: number[] = [];
    global.fetch = async (_url: RequestInfo | URL, options?: RequestInit) => {
      const res = httpMocks.createResponse();
      await importProjects(httpMocks.createRequest({ method: 'POST', body: JSON.parse(String(options?.body)) }), res);
      responses.push(res.statusCode);
      return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => res._getJSONData() } as Response;
    };
    const first = renderHook(() => useProjectMigration());
    await waitFor(() => expect(responses).toHaveLength(1));
    expect(responses).toEqual([409]);
    expect(localStorage.getItem(`${PREFIX}shared`)).toBe(bobBytes);
    expect(await prisma.project.findMany({ select: { data: true } })).toEqual([{ data: alice }]);
    first.unmount();

    // An equivalent retry after a previously persisted copy still completes.
    localStorage.setItem(`${PREFIX}shared`, JSON.stringify(alice));
    const retry = renderHook(() => useProjectMigration());
    await waitFor(() => expect(localStorage.getItem(`${PREFIX}shared`)).toBeNull());
    expect(responses).toEqual([409, 200]);
    expect(await prisma.project.count()).toBe(1);
    retry.unmount();
  });
});
