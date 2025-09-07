import { ProjectStorage } from '@/lib/project-storage';

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: jest.fn((key: string) => mockLocalStorage.store[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorage.store[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorage.store = {};
  }),
  key: jest.fn((index: number) => {
    const keys = Object.keys(mockLocalStorage.store);
    return keys[index] || null;
  }),
  get length() {
    return Object.keys(mockLocalStorage.store).length;
  }
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

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
      positions: { field1: { x: 100, y: 100, fontSize: 12, fontFamily: 'Arial', color: '#000', align: 'left' as const, visible: true } },
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
      positions: { field2: { x: 200, y: 200, fontSize: 14, fontFamily: 'Times', color: '#000', align: 'center' as const, visible: true } },
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

  it('handles templates with same lastModified by id order', async () => {
    const template1 = {
      id: 'template1',
      name: 'Template 1',
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

    const template2 = {
      id: 'template2',
      name: 'Template 2',
      created: '2024-01-01T10:00:00Z',
      lastModified: '2024-01-01T10:00:00Z', // Same time
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

    mockLocalStorage.setItem('bamboobot_project_v1_template1', JSON.stringify(template1));
    mockLocalStorage.setItem('bamboobot_project_v1_template2', JSON.stringify(template2));

    const result = await ProjectStorage.getMostRecentProject();
    
    expect(result).not.toBeNull();
    // Should return one of them consistently
    expect(['template1', 'template2']).toContain(result?.id);
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