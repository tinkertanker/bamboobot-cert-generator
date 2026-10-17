/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

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
