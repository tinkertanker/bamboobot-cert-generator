/**
 * Project Storage Module
 * 
 * Handles saving and loading complete certificate projects in localStorage.
 * Projects include text field positions, formatting, table data, and certificate images.
 */

import type { Positions, EmailConfig } from '@/types/certificate';

export interface SavedTemplate {
  id: string;
  name: string;
  created: string;
  lastModified: string;
  version: '1.0';
  
  // Text field configuration
  positions: Positions;
  columns: string[];
  
  // Table data - the actual certificate recipient data
  tableData: Array<Record<string, string>>;
  
  // Optional email configuration
  emailConfig?: EmailConfig;
  
  // Certificate image reference
  certificateImage: {
    url: string;
    filename: string;
    uploadedAt: string;
    isCloudStorage: boolean;
    storageProvider?: 'r2' | 's3' | 'local';
    checksum?: string; // For verifying file existence
  };
}

export interface TemplateListItem {
  id: string;
  name: string;
  created: string;
  lastModified: string;
  columnsCount: number;
  rowsCount?: number;
  hasEmailConfig: boolean;
  imageStatus: 'available' | 'missing' | 'checking';
}

const STORAGE_KEY_PREFIX = 'bamboobot_template_v1_';
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB limit for localStorage

export class TemplateStorage {
  /**
   * Save a template to localStorage
   */
  static async saveTemplate(
    name: string,
    positions: Positions,
    columns: string[],
    certificateImageUrl: string,
    certificateFilename: string,
    tableData: Array<Record<string, string>>,
    emailConfig?: EmailConfig,
    storageInfo?: { isCloudStorage: boolean; provider?: 'r2' | 's3' | 'local' }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      const template: SavedTemplate = {
        id,
        name: name.trim(),
        created: now,
        lastModified: now,
        version: '1.0',
        positions,
        columns,
        tableData,
        emailConfig,
        certificateImage: {
          url: certificateImageUrl,
          filename: certificateFilename,
          uploadedAt: now,
          isCloudStorage: storageInfo?.isCloudStorage || false,
          storageProvider: storageInfo?.provider,
        }
      };
      
      // Check storage size before saving
      const serialized = JSON.stringify(template);
      if (serialized.length > STORAGE_LIMIT_BYTES / 10) {
        // Single template shouldn't exceed 10% of storage limit
        return { success: false, error: 'Template too large to save' };
      }
      
      // Check total storage usage
      const currentUsage = this.getStorageUsage();
      if (currentUsage + serialized.length > STORAGE_LIMIT_BYTES) {
        return { success: false, error: 'Storage limit exceeded. Please delete some templates.' };
      }
      
      // Save to localStorage
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      localStorage.setItem(key, serialized);
      
      return { success: true, id };
    } catch (error) {
      console.error('Error saving template:', error);
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        return { success: false, error: 'Browser storage quota exceeded' };
      }
      return { success: false, error: 'Failed to save template' };
    }
  }
  
  /**
   * Load a template by ID
   */
  static loadTemplate(id: string): SavedTemplate | null {
    try {
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      const data = localStorage.getItem(key);
      
      if (!data) return null;
      
      const template = JSON.parse(data) as SavedTemplate;
      
      // Validate template structure
      if (!template.id || !template.positions || !template.certificateImage) {
        console.error('Invalid template structure');
        return null;
      }
      
      return template;
    } catch (error) {
      console.error('Error loading template:', error);
      return null;
    }
  }
  
  /**
   * Update an existing template
   */
  static async updateTemplate(
    id: string,
    updates: Partial<Omit<SavedTemplate, 'id' | 'created' | 'version'>>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const existing = this.loadTemplate(id);
      if (!existing) {
        return { success: false, error: 'Template not found' };
      }
      
      const updated: SavedTemplate = {
        ...existing,
        ...updates,
        lastModified: new Date().toISOString()
      };
      
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      localStorage.setItem(key, JSON.stringify(updated));
      
      return { success: true };
    } catch (error) {
      console.error('Error updating template:', error);
      return { success: false, error: 'Failed to update template' };
    }
  }
  
  /**
   * Delete a template
   */
  static deleteTemplate(id: string): boolean {
    try {
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error deleting template:', error);
      return false;
    }
  }
  
  /**
   * List all templates
   */
  static async listTemplates(): Promise<TemplateListItem[]> {
    try {
      const templates: TemplateListItem[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
        
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;
          
          const template = JSON.parse(data) as SavedTemplate;
          
          // Check if certificate image is available
          let imageStatus: TemplateListItem['imageStatus'] = 'checking';
          
          // For cloud storage, assume available (would need actual check in production)
          if (template.certificateImage.isCloudStorage) {
            imageStatus = 'available';
          } else {
            // For local storage, we can check if the URL is accessible
            // This is a simplified check - in production you'd want to actually verify
            imageStatus = template.certificateImage.url ? 'available' : 'missing';
          }
          
          templates.push({
            id: template.id,
            name: template.name,
            created: template.created,
            lastModified: template.lastModified,
            columnsCount: template.columns.length,
            rowsCount: template.tableData?.length || 0,
            hasEmailConfig: !!template.emailConfig?.isConfigured,
            imageStatus
          });
        } catch (error) {
          console.error('Error parsing template:', error);
          continue;
        }
      }
      
      // Sort by last modified date (newest first)
      return templates.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
    } catch (error) {
      console.error('Error listing templates:', error);
      return [];
    }
  }
  
  /**
   * Get the most recently modified template
   */
  static async getMostRecentTemplate(): Promise<SavedTemplate | null> {
    try {
      const templates = await this.listTemplates();
      
      if (templates.length === 0) {
        return null;
      }
      
      // Sort by lastModified descending
      templates.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
      
      // Load and return the most recent template
      return this.loadTemplate(templates[0].id);
    } catch (error) {
      console.error('Error getting most recent template:', error);
      return null;
    }
  }
  
  /**
   * Check storage usage
   */
  static getStorageUsage(): number {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 0;
    }
    
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
      
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += key.length + value.length;
      }
    }
    
    return totalSize;
  }
  
  /**
   * Get storage info
   */
  static getStorageInfo(): { used: number; limit: number; percentage: number } {
    const used = this.getStorageUsage();
    const limit = STORAGE_LIMIT_BYTES;
    const percentage = Math.round((used / limit) * 100);
    
    return { used, limit, percentage };
  }
  
  /**
   * Export template for sharing
   */
  static async exportTemplate(id: string, includeImage = false): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      const template = this.loadTemplate(id);
      if (!template) {
        return { success: false, error: 'Template not found' };
      }
      
      const exportData: Record<string, unknown> = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        template: { ...template }
      };
      
      // Optionally include base64 image for full portability
      if (includeImage && !template.certificateImage.isCloudStorage) {
        try {
          const response = await fetch(template.certificateImage.url);
          if (response.ok) {
            const blob = await response.blob();
            const base64 = await this.blobToBase64(blob);
            exportData.certificateImage = {
              base64,
              mimeType: blob.type
            };
          }
        } catch (error) {
          console.warn('Could not include image in export:', error);
        }
      }
      
      const json = JSON.stringify(exportData, null, 2);
      const filename = `${template.name.replace(/[^a-z0-9]/gi, '_')}_template.json`;
      
      return { success: true, data: json, filename };
    } catch (error) {
      console.error('Error exporting template:', error);
      return { success: false, error: 'Failed to export template' };
    }
  }
  
  /**
   * Import template from exported data
   */
  static async importTemplate(jsonData: string): Promise<{
    success: boolean;
    id?: string;
    error?: string;
  }> {
    try {
      const importData = JSON.parse(jsonData);
      
      // Validate import data
      if (!importData.version || !importData.template) {
        return { success: false, error: 'Invalid template file' };
      }
      
      const template = importData.template as SavedTemplate;
      
      // Handle embedded image if present
      if (importData.certificateImage?.base64) {
        // In a real implementation, you'd upload this to the server
        // For now, we'll just note that the image needs to be re-uploaded
        template.certificateImage.url = '';
        console.warn('Imported template contains embedded image - user will need to re-upload');
      }
      
      // Save with automatically generated new ID
      const result = await this.saveTemplate(
        `${template.name} (Imported)`,
        template.positions,
        template.columns,
        template.certificateImage.url,
        template.certificateImage.filename,
        template.tableData || [],
        template.emailConfig,
        {
          isCloudStorage: template.certificateImage.isCloudStorage,
          provider: template.certificateImage.storageProvider
        }
      );
      
      return result;
    } catch (error) {
      console.error('Error importing template:', error);
      return { success: false, error: 'Failed to import template' };
    }
  }
  
  /**
   * Clear all templates (use with caution)
   */
  static clearAllTemplates(): void {
    const keys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keys.push(key);
      }
    }
    
    keys.forEach(key => localStorage.removeItem(key));
  }
  
  /**
   * Helper: Convert blob to base64
   */
  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}