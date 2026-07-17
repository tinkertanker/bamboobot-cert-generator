import { ProjectStorage, SavedProject, ProjectListItem } from '@/lib/project-storage';
import type { Positions, EmailConfig } from '@/types/certificate';

describe('ProjectStorage', () => {
  const mockPositions: Positions = {
    name: { x: 100, y: 200, fontSize: 16, fontFamily: 'Arial', color: '#000000', align: 'center', visible: true },
    date: { x: 300, y: 400, fontSize: 14, fontFamily: 'Times', color: '#333333', align: 'left', visible: true }
  };
  
  const mockColumns = ['name', 'date'];
  const mockImageUrl = '/temp_images/certificate.jpg';
  const mockFilename = 'certificate.pdf';
  
  const mockTableData = [
    { name: 'John Doe', date: '2025-07-27' },
    { name: 'Jane Smith', date: '2025-07-28' }
  ];
  
  const mockEmailConfig: EmailConfig = {
    isConfigured: true,
    provider: 'resend',
    apiKey: 'test-key',
    from: 'test@example.com',
    senderName: 'Test Sender',
    emailColumn: 'email',
    subjectTemplate: 'Your Certificate',
    bodyTemplate: 'Here is your certificate'
  };

  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (index: number) => {
        const keys = Object.keys(store);
        return keys[index] || null;
      },
      get length() {
        return Object.keys(store).length;
      }
    };
  })();

  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('saveTemplate', () => {
    it('should save a template successfully', async () => {
      const result = await ProjectStorage.saveProject(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData,
        mockEmailConfig,
        { isCloudStorage: false }
      );

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify template was saved to localStorage
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('bamboobot_project_v1_')) {
          keys.push(key);
        }
      }
      expect(keys).toHaveLength(1);
    });

    it('should handle empty template name', async () => {
      const result = await ProjectStorage.saveProject(
        '   ', // Empty after trim
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      expect(result.success).toBe(true);
      const template = ProjectStorage.loadProject(result.id!);
      expect(template?.name).toBe('');
    });

    it('should handle storage quota exceeded error', async () => {
      // Mock localStorage.setItem to throw QuotaExceededError
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = jest.fn(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const result = await ProjectStorage.saveProject(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Browser storage quota exceeded');

      localStorageMock.setItem = originalSetItem;
    });

    it('should save template with cloud storage info', async () => {
      const result = await ProjectStorage.saveProject(
        'Cloud Template',
        mockPositions,
        mockColumns,
        'https://r2.example.com/template.jpg',
        mockFilename,
        mockTableData,
        undefined,
        { isCloudStorage: true, provider: 'r2' }
      );

      expect(result.success).toBe(true);
      const template = ProjectStorage.loadProject(result.id!);
      expect(template?.certificateImage.isCloudStorage).toBe(true);
      expect(template?.certificateImage.storageProvider).toBe('r2');
    });
  });

  describe('loadTemplate', () => {
    it('should load a saved template', async () => {
      const saveResult = await ProjectStorage.saveProject(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData,
        mockEmailConfig
      );

      const template = ProjectStorage.loadProject(saveResult.id!);

      expect(template).toBeDefined();
      expect(template?.name).toBe('Test Template');
      expect(template?.positions).toEqual(mockPositions);
      expect(template?.columns).toEqual(mockColumns);
      expect(template?.tableData).toEqual(mockTableData);
      expect(template?.emailConfig).toEqual(mockEmailConfig);
      expect(template?.certificateImage.url).toBe(mockImageUrl);
    });

    it('should return null for non-existent template', () => {
      const template = ProjectStorage.loadProject('non-existent-id');
      expect(template).toBeNull();
    });

    it('should handle invalid template data', () => {
      localStorage.setItem('bamboobot_project_v1_invalid', JSON.stringify({ invalid: 'data' }));
      const template = ProjectStorage.loadProject('invalid');
      expect(template).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template successfully', async () => {
      const saveResult = await ProjectStorage.saveProject(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const deleted = ProjectStorage.deleteProject(saveResult.id!);
      expect(deleted).toBe(true);

      // Verify template is gone
      const template = ProjectStorage.loadProject(saveResult.id!);
      expect(template).toBeNull();
    });

    it('should handle deletion of non-existent template', () => {
      const deleted = ProjectStorage.deleteProject('non-existent-id');
      expect(deleted).toBe(true); // Returns true even if not found
    });
  });

  describe('listTemplates', () => {
    it('should list all templates sorted by lastModified', async () => {
      // Save multiple templates with slight delays to ensure different timestamps
      const result1 = await ProjectStorage.saveProject(
        'Template 1',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await ProjectStorage.saveProject(
        'Template 2',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData,
        mockEmailConfig
      );

      const templates = await ProjectStorage.listProjects();

      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe('Template 2'); // Most recent first
      expect(templates[1].name).toBe('Template 1');
      expect(templates[0].hasEmailConfig).toBe(true);
      expect(templates[1].hasEmailConfig).toBe(false);
    });

    it('should handle corrupted template data gracefully', async () => {
      // Save a valid template
      await ProjectStorage.saveProject(
        'Valid Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      // Add corrupted data
      localStorage.setItem('bamboobot_project_v1_corrupted', 'invalid json');

      const templates = await ProjectStorage.listProjects();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Valid Template');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      const saveResult = await ProjectStorage.saveProject(
        'Original Name',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const newPositions: Positions = {
        ...mockPositions,
        title: { x: 500, y: 100, fontSize: 20, fontFamily: 'Helvetica', color: '#FF0000', align: 'right', visible: true }
      };

      const updateResult = await ProjectStorage.updateProject(saveResult.id!, {
        name: 'Updated Name',
        positions: newPositions,
        emailConfig: mockEmailConfig
      });

      expect(updateResult.success).toBe(true);

      const updated = ProjectStorage.loadProject(saveResult.id!);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.positions).toEqual(newPositions);
      expect(updated?.emailConfig).toEqual(mockEmailConfig);
      expect(updated?.created).toBe(updated?.created); // Created date shouldn't change
    });

    it('should fail when updating non-existent template', async () => {
      const result = await ProjectStorage.updateProject('non-existent', {
        name: 'New Name'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project not found');
    });
  });

  describe('exportTemplate', () => {
    beforeEach(() => {
      // Mock fetch for image loading
      global.fetch = jest.fn();
    });

    it('should export template without image', async () => {
      const saveResult = await ProjectStorage.saveProject(
        'Export Test',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const exportResult = await ProjectStorage.exportProject(saveResult.id!, false);

      expect(exportResult.success).toBe(true);
      expect(exportResult.data).toBeDefined();
      expect(exportResult.filename).toBe('Export_Test_project.json');

      const exportData = JSON.parse(exportResult.data!);
      expect(exportData.version).toBe('1.0');
      expect(exportData.project.name).toBe('Export Test');
      expect(exportData.certificateImage).toBeUndefined();
    });

    it('should handle export of non-existent template', async () => {
      const result = await ProjectStorage.exportProject('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Project not found');
    });
  });

  describe('importTemplate', () => {
    it('should import a valid template', async () => {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        project: {
          id: 'old-id',
          name: 'Imported Project',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          version: '1.0',
          positions: mockPositions,
          columns: mockColumns,
          tableData: mockTableData,
          certificateImage: {
            url: mockImageUrl,
            filename: mockFilename,
            uploadedAt: new Date().toISOString(),
            isCloudStorage: false
          }
        }
      };

      const result = await ProjectStorage.importProject(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.id).not.toBe('old-id'); // Should generate new ID

      const imported = ProjectStorage.loadProject(result.id!);
      expect(imported?.name).toBe('Imported Project (Imported)');
      expect(imported?.positions).toEqual(mockPositions);
    });

    it('should handle invalid import data', async () => {
      const result = await ProjectStorage.importProject('invalid json');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to import project');
    });

    it('should validate import data structure', async () => {
      const invalidData = { notATemplate: true };
      const result = await ProjectStorage.importProject(JSON.stringify(invalidData));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid project file');
    });
  });

  describe('adversarial inputs and limits', () => {
    it('rejects a single project larger than 10% of the storage limit', async () => {
      const bigTableData = Array.from({ length: 2000 }, (_, i) => ({
        name: `Person ${i}`,
        essay: 'x'.repeat(300)
      }));

      const result = await ProjectStorage.saveProject(
        'Huge Project',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        bigTableData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Project too large to save');
      expect(ProjectStorage.getStorageUsage()).toBe(0);
    });

    it('rejects a save that would exceed the total storage limit', async () => {
      // Fill storage with non-project payloads counted by getStorageUsage
      // via legitimately-prefixed keys just under the cap.
      const chunk = 'x'.repeat(512 * 1024);
      for (let i = 0; i < 10; i++) {
        localStorage.setItem(`bamboobot_project_v1_filler_${i}`, chunk);
      }

      const result = await ProjectStorage.saveProject(
        'One More',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage limit exceeded. Please delete some projects.');
    });

    it('survives hostile non-object JSON payloads when listing', async () => {
      await ProjectStorage.saveProject(
        'Valid Project',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );
      localStorage.setItem('bamboobot_project_v1_null', 'null');
      localStorage.setItem('bamboobot_project_v1_string', '"just a string"');
      localStorage.setItem('bamboobot_project_v1_number', '42');
      localStorage.setItem('bamboobot_project_v1_array', '[1,2,3]');
      localStorage.setItem('bamboobot_project_v1_no_image', JSON.stringify({
        id: 'no-image', name: 'No Image', created: 'x', lastModified: 'x', columns: []
      }));

      const projects = await ProjectStorage.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Valid Project');
    });

    it('does not pollute Object.prototype via crafted __proto__ payloads', async () => {
      // A literal __proto__ key would set the fixture's prototype and vanish
      // from JSON.stringify; build the hostile payload as a raw string instead.
      const hostile = '{"id":"evil","name":"Evil","created":"2024-01-01T10:00:00Z",'
        + '"lastModified":"2024-01-01T10:00:00Z","version":"1.0","positions":{"a":{}},'
        + '"columns":[],"tableData":[],'
        + '"certificateImage":{"url":"/x.jpg","filename":"x.pdf","uploadedAt":"x","isCloudStorage":false},'
        + '"__proto__":{"polluted":true}}';
      expect(hostile).toContain('"__proto__"');
      localStorage.setItem('bamboobot_project_v1_evil', hostile);

      await ProjectStorage.updateProject('evil', { name: 'Renamed' });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      const reloaded = ProjectStorage.loadProject('evil');
      expect(reloaded?.name).toBe('Renamed');
    });

    it('sanitizes hostile project names in export filenames', async () => {
      const saveResult = await ProjectStorage.saveProject(
        '../../etc/passwd',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );
      const exportResult = await ProjectStorage.exportProject(saveResult.id!, false);
      expect(exportResult.success).toBe(true);
      expect(exportResult.filename).toBe('______etc_passwd_project.json');
      expect(exportResult.filename).not.toMatch(/[/\\.]{2}/);
    });

    it('fails gracefully when importing a project without a certificate image', async () => {
      const result = await ProjectStorage.importProject(JSON.stringify({
        version: '1.0',
        project: { name: 'Broken', positions: {}, columns: [] }
      }));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to import project');
    });

    it('clears the image URL when importing an embedded-image export', async () => {
      const result = await ProjectStorage.importProject(JSON.stringify({
        version: '1.0',
        certificateImage: { base64: 'data:image/png;base64,AAAA', mimeType: 'image/png' },
        project: {
          name: 'Embedded',
          positions: mockPositions,
          columns: mockColumns,
          tableData: mockTableData,
          certificateImage: { url: '/should-be-cleared.jpg', filename: 'x.pdf', uploadedAt: 'x', isCloudStorage: false }
        }
      }));
      expect(result.success).toBe(true);
      const imported = ProjectStorage.loadProject(result.id!);
      expect(imported?.certificateImage.url).toBe('');
    });
  });

  describe('template-to-project migration', () => {
    it('copies old template keys to project keys and dedupes listings', async () => {
      const legacy = {
        id: 'legacy-1',
        name: 'Legacy Template',
        created: '2024-01-01T10:00:00Z',
        lastModified: '2024-01-01T10:00:00Z',
        version: '1.0',
        positions: { a: {} },
        columns: ['a'],
        tableData: [{ a: '1' }],
        certificateImage: { url: '/x.jpg', filename: 'x.pdf', uploadedAt: 'x', isCloudStorage: false }
      };
      localStorage.setItem('bamboobot_template_v1_legacy-1', JSON.stringify(legacy));

      const { migrated, errors } = ProjectStorage.migrateFromTemplateStorage();
      expect(migrated).toBe(1);
      expect(errors).toBe(0);
      expect(localStorage.getItem('bamboobot_project_v1_legacy-1')).not.toBeNull();

      // Both old and new keys now hold the same project id; listing must dedupe.
      const projects = await ProjectStorage.listProjects();
      expect(projects.filter(p => p.id === 'legacy-1')).toHaveLength(1);

      // loadProject falls back to the old key when only it exists.
      localStorage.removeItem('bamboobot_project_v1_legacy-1');
      expect(ProjectStorage.loadProject('legacy-1')?.name).toBe('Legacy Template');
    });
  });

  describe('storage management', () => {
    it('should calculate storage usage correctly', async () => {
      const initialUsage = ProjectStorage.getStorageUsage();
      expect(initialUsage).toBe(0);

      await ProjectStorage.saveProject(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const usage = ProjectStorage.getStorageUsage();
      expect(usage).toBeGreaterThan(0);
    });

    it('should provide storage info', () => {
      const info = ProjectStorage.getStorageInfo();
      expect(info.used).toBe(0);
      expect(info.limit).toBe(5 * 1024 * 1024); // 5MB
      expect(info.percentage).toBe(0);
    });

    it('should clear all templates', async () => {
      // Save multiple templates
      await ProjectStorage.saveProject('Template 1', mockPositions, mockColumns, mockImageUrl, mockFilename, mockTableData);
      await ProjectStorage.saveProject('Template 2', mockPositions, mockColumns, mockImageUrl, mockFilename, mockTableData);

      const templatesBefore = await ProjectStorage.listProjects();
      expect(templatesBefore).toHaveLength(2);

      ProjectStorage.clearAllProjects();

      const templatesAfter = await ProjectStorage.listProjects();
      expect(templatesAfter).toHaveLength(0);
    });
  });
});