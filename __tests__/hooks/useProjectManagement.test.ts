import { renderHook, waitFor } from '@testing-library/react';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { ProjectStorage, type SavedProject } from '@/lib/project-storage';
import { SessionStorage } from '@/lib/session-storage';
import type { EmailConfig } from '@/types/certificate';

const legacyProject: SavedProject = {
  id: 'legacy-project',
  name: 'Legacy project',
  created: '2025-01-01T00:00:00.000Z',
  lastModified: '2025-01-01T00:00:00.000Z',
  version: '1.0',
  positions: {
    Name: { x: 50, y: 50, color: '#000000' }
  },
  columns: ['Name'],
  tableData: [{ Name: 'Ada' }],
  certificateImage: {
    url: '/certificate.png',
    filename: 'certificate.png',
    uploadedAt: '2025-01-01T00:00:00.000Z',
    isCloudStorage: false
  }
};

const emailConfig: EmailConfig = {
  senderName: '',
  subject: '',
  message: '',
  deliveryMethod: 'download',
  isConfigured: false
};

const createProps = () => ({
  setPositions: jest.fn(),
  setEmailConfig: jest.fn(),
  setUploadedFileUrl: jest.fn(),
  setUploadedFile: jest.fn(),
  loadSessionData: jest.fn().mockResolvedValue(undefined),
  uploadToServer: jest.fn().mockResolvedValue(undefined),
  showToast: jest.fn(),
  manualSave: jest.fn().mockResolvedValue({ success: true }),
  uploadedFileUrl: null,
  uploadedFile: null,
  positions: {},
  emailConfig,
  tableData: [],
  clearFile: jest.fn(),
  clearPositions: jest.fn(),
  clearDragState: jest.fn(),
  clearData: jest.fn()
});

describe('useProjectManagement colour provenance migration', () => {
  beforeEach(() => {
    jest.spyOn(ProjectStorage, 'migrateFromTemplateStorage').mockReturnValue({
      migrated: 0,
      errors: 0
    });
    jest.spyOn(ProjectStorage, 'getMostRecentProject').mockResolvedValue(
      legacyProject
    );
    jest.spyOn(SessionStorage, 'loadSession').mockReturnValue(null);
    jest.spyOn(ProjectStorage, 'updateProject').mockResolvedValue({
      success: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defers persistence to autosave instead of writing during project load', async () => {
    const props = createProps();

    renderHook(() => useProjectManagement(props));

    await waitFor(() => expect(props.setPositions).toHaveBeenCalled());
    expect(props.setPositions).toHaveBeenCalledWith({
      Name: {
        ...legacyProject.positions.Name,
        isColorAutomatic: true
      }
    });
    expect(ProjectStorage.updateProject).not.toHaveBeenCalled();
  });
});
