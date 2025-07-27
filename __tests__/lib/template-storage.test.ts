import { TemplateStorage, SavedTemplate, TemplateListItem } from '@/lib/template-storage';
import type { Positions, EmailConfig } from '@/types/certificate';

describe('TemplateStorage', () => {
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
      const result = await TemplateStorage.saveTemplate(
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
        if (key && key.startsWith('bamboobot_template_v1_')) {
          keys.push(key);
        }
      }
      expect(keys).toHaveLength(1);
    });

    it('should handle empty template name', async () => {
      const result = await TemplateStorage.saveTemplate(
        '   ', // Empty after trim
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      expect(result.success).toBe(true);
      const template = TemplateStorage.loadTemplate(result.id!);
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

      const result = await TemplateStorage.saveTemplate(
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
      const result = await TemplateStorage.saveTemplate(
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
      const template = TemplateStorage.loadTemplate(result.id!);
      expect(template?.certificateImage.isCloudStorage).toBe(true);
      expect(template?.certificateImage.storageProvider).toBe('r2');
    });
  });

  describe('loadTemplate', () => {
    it('should load a saved template', async () => {
      const saveResult = await TemplateStorage.saveTemplate(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData,
        mockEmailConfig
      );

      const template = TemplateStorage.loadTemplate(saveResult.id!);

      expect(template).toBeDefined();
      expect(template?.name).toBe('Test Template');
      expect(template?.positions).toEqual(mockPositions);
      expect(template?.columns).toEqual(mockColumns);
      expect(template?.tableData).toEqual(mockTableData);
      expect(template?.emailConfig).toEqual(mockEmailConfig);
      expect(template?.certificateImage.url).toBe(mockImageUrl);
    });

    it('should return null for non-existent template', () => {
      const template = TemplateStorage.loadTemplate('non-existent-id');
      expect(template).toBeNull();
    });

    it('should handle invalid template data', () => {
      localStorage.setItem('bamboobot_template_v1_invalid', JSON.stringify({ invalid: 'data' }));
      const template = TemplateStorage.loadTemplate('invalid');
      expect(template).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template successfully', async () => {
      const saveResult = await TemplateStorage.saveTemplate(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const deleted = TemplateStorage.deleteTemplate(saveResult.id!);
      expect(deleted).toBe(true);

      // Verify template is gone
      const template = TemplateStorage.loadTemplate(saveResult.id!);
      expect(template).toBeNull();
    });

    it('should handle deletion of non-existent template', () => {
      const deleted = TemplateStorage.deleteTemplate('non-existent-id');
      expect(deleted).toBe(true); // Returns true even if not found
    });
  });

  describe('listTemplates', () => {
    it('should list all templates sorted by lastModified', async () => {
      // Save multiple templates with slight delays to ensure different timestamps
      const result1 = await TemplateStorage.saveTemplate(
        'Template 1',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await TemplateStorage.saveTemplate(
        'Template 2',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData,
        mockEmailConfig
      );

      const templates = await TemplateStorage.listTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe('Template 2'); // Most recent first
      expect(templates[1].name).toBe('Template 1');
      expect(templates[0].hasEmailConfig).toBe(true);
      expect(templates[1].hasEmailConfig).toBe(false);
    });

    it('should handle corrupted template data gracefully', async () => {
      // Save a valid template
      await TemplateStorage.saveTemplate(
        'Valid Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      // Add corrupted data
      localStorage.setItem('bamboobot_template_v1_corrupted', 'invalid json');

      const templates = await TemplateStorage.listTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Valid Template');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      const saveResult = await TemplateStorage.saveTemplate(
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

      const updateResult = await TemplateStorage.updateTemplate(saveResult.id!, {
        name: 'Updated Name',
        positions: newPositions,
        emailConfig: mockEmailConfig
      });

      expect(updateResult.success).toBe(true);

      const updated = TemplateStorage.loadTemplate(saveResult.id!);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.positions).toEqual(newPositions);
      expect(updated?.emailConfig).toEqual(mockEmailConfig);
      expect(updated?.created).toBe(updated?.created); // Created date shouldn't change
    });

    it('should fail when updating non-existent template', async () => {
      const result = await TemplateStorage.updateTemplate('non-existent', {
        name: 'New Name'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template not found');
    });
  });

  describe('exportTemplate', () => {
    beforeEach(() => {
      // Mock fetch for image loading
      global.fetch = jest.fn();
    });

    it('should export template without image', async () => {
      const saveResult = await TemplateStorage.saveTemplate(
        'Export Test',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const exportResult = await TemplateStorage.exportTemplate(saveResult.id!, false);

      expect(exportResult.success).toBe(true);
      expect(exportResult.data).toBeDefined();
      expect(exportResult.filename).toBe('Export_Test_template.json');

      const exportData = JSON.parse(exportResult.data!);
      expect(exportData.version).toBe('1.0');
      expect(exportData.template.name).toBe('Export Test');
      expect(exportData.certificateImage).toBeUndefined();
    });

    it('should handle export of non-existent template', async () => {
      const result = await TemplateStorage.exportTemplate('non-existent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Template not found');
    });
  });

  describe('importTemplate', () => {
    it('should import a valid template', async () => {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        template: {
          id: 'old-id',
          name: 'Imported Template',
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

      const result = await TemplateStorage.importTemplate(JSON.stringify(exportData));

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.id).not.toBe('old-id'); // Should generate new ID

      const imported = TemplateStorage.loadTemplate(result.id!);
      expect(imported?.name).toBe('Imported Template (Imported)');
      expect(imported?.positions).toEqual(mockPositions);
    });

    it('should handle invalid import data', async () => {
      const result = await TemplateStorage.importTemplate('invalid json');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to import template');
    });

    it('should validate import data structure', async () => {
      const invalidData = { notATemplate: true };
      const result = await TemplateStorage.importTemplate(JSON.stringify(invalidData));
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid template file');
    });
  });

  describe('storage management', () => {
    it('should calculate storage usage correctly', async () => {
      const initialUsage = TemplateStorage.getStorageUsage();
      expect(initialUsage).toBe(0);

      await TemplateStorage.saveTemplate(
        'Test Template',
        mockPositions,
        mockColumns,
        mockImageUrl,
        mockFilename,
        mockTableData
      );

      const usage = TemplateStorage.getStorageUsage();
      expect(usage).toBeGreaterThan(0);
    });

    it('should provide storage info', () => {
      const info = TemplateStorage.getStorageInfo();
      expect(info.used).toBe(0);
      expect(info.limit).toBe(5 * 1024 * 1024); // 5MB
      expect(info.percentage).toBe(0);
    });

    it('should clear all templates', async () => {
      // Save multiple templates
      await TemplateStorage.saveTemplate('Template 1', mockPositions, mockColumns, mockImageUrl, mockFilename, mockTableData);
      await TemplateStorage.saveTemplate('Template 2', mockPositions, mockColumns, mockImageUrl, mockFilename, mockTableData);

      const templatesBefore = await TemplateStorage.listTemplates();
      expect(templatesBefore).toHaveLength(2);

      TemplateStorage.clearAllTemplates();

      const templatesAfter = await TemplateStorage.listTemplates();
      expect(templatesAfter).toHaveLength(0);
    });
  });
});