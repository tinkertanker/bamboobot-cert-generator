/** @jest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';

const mockUseSession = jest.fn();
jest.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

jest.mock('@/lib/session-storage', () => ({
  SessionStorage: {
    loadSession: jest.fn(() => null),
    getSessionAge: jest.fn(() => null),
    clearSession: jest.fn(),
  },
}));
jest.mock('@/lib/project-storage', () => ({
  ProjectStorage: {
    migrateFromTemplateStorage: jest.fn(() => ({ migrated: 0 })),
    getMostRecentProject: jest.fn(async () => null),
  },
}));

import { useProjectManagement } from '@/hooks/useProjectManagement';
import { SessionStorage } from '@/lib/session-storage';
import { ProjectStorage } from '@/lib/project-storage';
import { useTableData } from '@/hooks/useTableData';

function makeProps() {
  return {
    setPositions: jest.fn(),
    setEmailConfig: jest.fn(),
    setUploadedFileUrl: jest.fn(),
    setUploadedFile: jest.fn(),
    loadSessionData: jest.fn(async () => {}),
    uploadToServer: jest.fn(async () => undefined),
    showToast: jest.fn(),
    manualSave: jest.fn(async () => ({ success: true })),
    uploadedFileUrl: null,
    uploadedFile: null,
    positions: {},
    emailConfig: {} as any,
    tableData: [],
    automaticTextColorResult: null,
    clearFile: jest.fn(),
    clearPositions: jest.fn(),
    clearDragState: jest.fn(),
    clearData: jest.fn(),
  };
}

describe('useProjectManagement startup restore gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not read localStorage while the auth status is loading', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    renderHook(() => useProjectManagement(makeProps()));
    // The account guard has not reconciled the owner yet, so no restore.
    expect(SessionStorage.loadSession).not.toHaveBeenCalled();
    expect(ProjectStorage.getMostRecentProject).not.toHaveBeenCalled();
  });

  it('restores once the status settles (authenticated), and only once', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    const { rerender } = renderHook(() => useProjectManagement(makeProps()));
    expect(SessionStorage.loadSession).not.toHaveBeenCalled();

    mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, status: 'authenticated' });
    rerender();
    // Flush the async startup routine.
    await Promise.resolve();
    expect(SessionStorage.loadSession).toHaveBeenCalledTimes(1);

    // A later re-render must not trigger a second restore.
    rerender();
    await Promise.resolve();
    expect(SessionStorage.loadSession).toHaveBeenCalledTimes(1);
  });

  it('restores in open (unauthenticated) mode so local single-user use still works', async () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    renderHook(() => useProjectManagement(makeProps()));
    await Promise.resolve();
    expect(SessionStorage.loadSession).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('restores saved recipient rows without discarding a newer working session (session=%s)', async sessionExists => {
    mockUseSession.mockReturnValue({ data: { user: { id: 'fixture' } }, status: 'authenticated' });
    const rows = [{ Name: 'Ada', Course: 'Robotics' }, { Name: 'Grace', Course: 'Design' }];
    jest.mocked(ProjectStorage.getMostRecentProject).mockResolvedValueOnce({
      id: 'saved', name: 'Saved certificate', created: '', lastModified: '', version: '1.0',
      columns: ['Course', 'Name'], tableData: rows, positions: {},
      certificateImage: { url: '/fixture.png', filename: 'fixture.png', uploadedAt: '', isCloudStorage: true },
    });
    jest.mocked(SessionStorage.loadSession).mockReturnValueOnce(sessionExists ? {
      tableData: [{ Name: 'Unsaved edit' }], tableInput: 'Name\nUnsaved edit',
      useCSVMode: false, isFirstRowHeader: true, lastModified: new Date().toISOString(),
    } : null);
    jest.mocked(SessionStorage.getSessionAge).mockReturnValueOnce(1000);
    const { result } = renderHook(() => {
      const table = useTableData();
      const project = useProjectManagement({ ...makeProps(), loadSessionData: table.loadSessionData });
      return { table, project };
    });
    await waitFor(() => expect(result.current.project.hasManuallySaved).toBe(true));
    expect(result.current.table.tableData).toEqual(sessionExists ? [{ Name: 'Unsaved edit' }] : rows);
    expect(result.current.table.tableInput).toBe(sessionExists ? 'Name\nUnsaved edit' : 'Course\tName\nRobotics\tAda\nDesign\tGrace');
  });
});
