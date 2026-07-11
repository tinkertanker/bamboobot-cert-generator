/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

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

function makeProps() {
  return {
    setPositions: jest.fn(),
    setEmailConfig: jest.fn(),
    setUploadedFileUrl: jest.fn(),
    setUploadedFile: jest.fn(),
    loadSessionData: jest.fn(async () => {}),
    uploadToServer: jest.fn(async () => ({})),
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
});
