import { ProjectStorage } from '@/lib/project-storage';
import { installMockLocalStorage } from '../helpers/mock-local-storage';

const mockLocalStorage = installMockLocalStorage();

describe('ProjectStorage - getMostRecentTemplate', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  it('returns null when no templates exist', async () => {
    const result = await ProjectStorage.getMostRecentProject();
    expect(result).toBeNull();
  });

  it('returns the most recently modified template', async () => {
    // Create older template
    const olderTemplate = {
      id: 'older',
      name: 'Older Template',
      created: '2024-01-01T10:00:00Z',
      lastModified: '2024-01-01T10:00:00Z',
      version: '1.0' as const,
      positions: { field1: { x: 100, y: 100, fontSize: 12, fontFamily: 'Helvetica', color: '#000', alignment: 'left' as const, isVisible: true } },
      columns: ['field1'],
      certificateImage: {
        url: '/test.jpg',
        filename: 'test.pdf',
        uploadedAt: '2024-01-01T10:00:00Z',
        isCloudStorage: false
      }
    };

    // Create newer template
    const newerTemplate = {
      id: 'newer',
      name: 'Newer Template',
      created: '2024-01-02T10:00:00Z',
      lastModified: '2024-01-03T10:00:00Z', // More recent
      version: '1.0' as const,
      positions: { field2: { x: 200, y: 200, fontSize: 14, fontFamily: 'Times', color: '#000', alignment: 'center' as const, isVisible: true } },
      columns: ['field2'],
      certificateImage: {
        url: '/test2.jpg',
        filename: 'test2.pdf',
        uploadedAt: '2024-01-02T10:00:00Z',
        isCloudStorage: false
      }
    };

    // Save both templates
    mockLocalStorage.setItem('bamboobot_project_v1_older', JSON.stringify(olderTemplate));
    mockLocalStorage.setItem('bamboobot_project_v1_newer', JSON.stringify(newerTemplate));

    const result = await ProjectStorage.getMostRecentProject();
    
    expect(result).not.toBeNull();
    expect(result?.id).toBe('newer');
    expect(result?.name).toBe('Newer Template');
  });

  it('handles corrupted template data gracefully', async () => {
    // Save one valid template
    const validTemplate = {
      id: 'valid',
      name: 'Valid Template',
      created: '2024-01-01T10:00:00Z',
      lastModified: '2024-01-01T10:00:00Z',
      version: '1.0' as const,
      positions: {},
      columns: [],
      certificateImage: {
        url: '/test.jpg',
        filename: 'test.pdf',
        uploadedAt: '2024-01-01T10:00:00Z',
        isCloudStorage: false
      }
    };

    mockLocalStorage.setItem('bamboobot_project_v1_valid', JSON.stringify(validTemplate));
    mockLocalStorage.setItem('bamboobot_project_v1_corrupt', 'invalid json');

    const result = await ProjectStorage.getMostRecentProject();
    
    // Should still return the valid template
    expect(result).not.toBeNull();
    expect(result?.id).toBe('valid');
  });
});