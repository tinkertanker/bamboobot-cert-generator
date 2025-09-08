/**
 * Project Storage Module
 * 
 * Handles saving and loading complete certificate projects in localStorage.
 * Projects include text field positions, formatting, table data, and certificate images.
 */

import type { Positions, EmailConfig } from '@/types/certificate';

export interface SavedProject {
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

export interface ProjectListItem {
  id: string;
  name: string;
  created: string;
  lastModified: string;
  columnsCount: number;
  rowsCount?: number;
  hasEmailConfig: boolean;
  imageStatus: 'available' | 'missing' | 'checking';
}

const STORAGE_KEY_PREFIX = 'bamboobot_project_v1_';
const OLD_STORAGE_KEY_PREFIX = 'bamboobot_template_v1_'; // For migration
const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB limit for localStorage

export class ProjectStorage {
  private static get serverEnabled(): boolean {
    // Allow either new NEXT_PUBLIC_* or legacy flag name
    const v = (process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE || process.env.PROJECT_SERVER_PERSISTENCE || '').toString().toLowerCase();
    return v === 'true' || v === '1';
  }

  static isServerMode(): boolean {
    return this.serverEnabled;
  }
  /**
   * Migrate old template storage keys to new project keys
   */
  static migrateFromTemplateStorage(): { migrated: number; errors: number } {
    let migrated = 0;
    let errors = 0;

    try {
      const keysToMigrate: string[] = [];
      
      // Find all old template keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(OLD_STORAGE_KEY_PREFIX)) {
          keysToMigrate.push(key);
        }
      }
      
      // Migrate each key
      for (const oldKey of keysToMigrate) {
        try {
          const data = localStorage.getItem(oldKey);
          if (data) {
            const newKey = oldKey.replace(OLD_STORAGE_KEY_PREFIX, STORAGE_KEY_PREFIX);
            localStorage.setItem(newKey, data);
            // Keep old key temporarily for safety - can be removed in a future update
            migrated++;
          }
        } catch (error) {
          console.error(`Error migrating key ${oldKey}:`, error);
          errors++;
        }
      }
      
      console.log(`Migration complete: ${migrated} projects migrated, ${errors} errors`);
    } catch (error) {
      console.error('Error during migration:', error);
    }
    
    return { migrated, errors };
  }

  /**
   * Save a project to localStorage
   */
  static async saveProject(
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
      if (this.serverEnabled) {
        // Persist to server
        const body = {
          name,
          data: {
            id: 'server-generated',
            name,
            created: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            version: '1.0',
            positions,
            columns,
            tableData,
            emailConfig,
            certificateImage: {
              url: certificateImageUrl,
              filename: certificateFilename,
              uploadedAt: new Date().toISOString(),
              isCloudStorage: !!storageInfo?.isCloudStorage,
              storageProvider: storageInfo?.provider,
            },
          },
          clientProjectId: undefined,
        };
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { success: false, error: j?.error || 'Failed to save project (server)' };
        }
        const json = await res.json();
        return { success: true, id: json?.project?.id };
      }

      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      const project: SavedProject = {
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
      const serialized = JSON.stringify(project);
      if (serialized.length > STORAGE_LIMIT_BYTES / 10) {
        // Single project shouldn't exceed 10% of storage limit
        return { success: false, error: 'Project too large to save' };
      }
      
      // Check total storage usage
      const currentUsage = this.getStorageUsage();
      if (currentUsage + serialized.length > STORAGE_LIMIT_BYTES) {
        return { success: false, error: 'Storage limit exceeded. Please delete some projects.' };
      }
      
      // Save to localStorage
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      localStorage.setItem(key, serialized);
      
      return { success: true, id };
    } catch (error) {
      console.error('Error saving project:', error);
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        return { success: false, error: 'Browser storage quota exceeded' };
      }
      return { success: false, error: 'Failed to save project' };
    }
  }
  
  /**
   * Load a project by ID
   */
  static loadProject(id: string): SavedProject | null {
    try {
      if (this.serverEnabled) {
        // Synchronous signature retained for legacy callers; we use deasync via sync XHR not allowed.
        // Instead, expose an async helper below; but for minimal change, we throw here to encourage async usage.
        // However, some UI depends on sync call (LoadProjectModal). Provide a best-effort async shim via fetch+sync wait is not viable.
        // So we return null here and expect async path usage elsewhere. (Kept for backward compatibility.)
      }
      // Try new key first
      let key = `${STORAGE_KEY_PREFIX}${id}`;
      let data = localStorage.getItem(key);
      
      // Fall back to old key if not found (for backward compatibility)
      if (!data) {
        key = `${OLD_STORAGE_KEY_PREFIX}${id}`;
        data = localStorage.getItem(key);
      }
      
      if (!data) return null;
      
      const project = JSON.parse(data) as SavedProject;
      
      // Validate project structure
      if (!project.id || !project.positions || !project.certificateImage) {
        console.error('Invalid project structure');
        return null;
      }
      
      return project;
    } catch (error) {
      console.error('Error loading project:', error);
      return null;
    }
  }

  /** Server-mode: load a project (async) */
  static async loadProjectServer(id: string): Promise<SavedProject | null> {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return null;
      const json = await res.json();
      const p = json?.project as any;
      if (!p) return null;
      const base = (p.data ?? {}) as Partial<SavedProject>;
      const safe: SavedProject = {
        id: p.id,
        name: p.name || base.name || 'Untitled',
        created: p.createdAt || base.created || new Date().toISOString(),
        lastModified: p.updatedAt || base.lastModified || new Date().toISOString(),
        version: '1.0',
        positions: (base as any)?.positions ?? {},
        columns: (base as any)?.columns ?? [],
        tableData: (base as any)?.tableData ?? [],
        emailConfig: (base as any)?.emailConfig,
        certificateImage: {
          url: (base as any)?.certificateImage?.url ?? '',
          filename: (base as any)?.certificateImage?.filename ?? '',
          uploadedAt: (base as any)?.certificateImage?.uploadedAt ?? new Date().toISOString(),
          isCloudStorage: (base as any)?.certificateImage?.isCloudStorage ?? false,
          storageProvider: (base as any)?.certificateImage?.storageProvider,
          checksum: (base as any)?.certificateImage?.checksum,
        },
      };
      return safe;
    } catch (e) {
      console.error('Error loading project (server):', e);
      return null;
    }
  }
  
  /**
   * Update an existing project
   */
  static async updateProject(
    id: string,
    updates: Partial<Omit<SavedProject, 'id' | 'created' | 'version'>>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.serverEnabled) {
        // Merge server-side by fetching current, merging, and PUT back
        const current = await this.loadProjectServer(id);
        if (!current) return { success: false, error: 'Project not found' };
        const merged: SavedProject = {
          ...current,
          ...updates,
          lastModified: new Date().toISOString(),
        } as SavedProject;
        const res = await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updates.name ?? current.name,
            data: merged,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          return { success: false, error: j?.error || 'Failed to update project' };
        }
        return { success: true };
      }
      const existing = this.loadProject(id);
      if (!existing) {
        return { success: false, error: 'Project not found' };
      }
      
      const updated: SavedProject = {
        ...existing,
        ...updates,
        lastModified: new Date().toISOString()
      };
      
      // Save with new key format
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      localStorage.setItem(key, JSON.stringify(updated));
      
      // Remove old key if it exists
      const oldKey = `${OLD_STORAGE_KEY_PREFIX}${id}`;
      if (localStorage.getItem(oldKey)) {
        localStorage.removeItem(oldKey);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating project:', error);
      return { success: false, error: 'Failed to update project' };
    }
  }
  
  /**
   * Delete a project
   */
  static deleteProject(id: string): boolean {
    try {
      if (this.serverEnabled) {
        // Fire-and-forget; caller does not await
        void fetch(`/api/projects/${id}`, { method: 'DELETE' });
        return true;
      }
      // Remove both new and old keys
      const key = `${STORAGE_KEY_PREFIX}${id}`;
      const oldKey = `${OLD_STORAGE_KEY_PREFIX}${id}`;
      localStorage.removeItem(key);
      localStorage.removeItem(oldKey);
      return true;
    } catch (error) {
      console.error('Error deleting project:', error);
      return false;
    }
  }
  
  /**
   * List all projects (including migrated ones)
   */
  static async listProjects(): Promise<ProjectListItem[]> {
    try {
      if (this.serverEnabled) {
        const res = await fetch('/api/projects');
        if (!res.ok) return [];
        const json = await res.json();
        const projects = (json?.projects ?? []) as Array<{ id: string; name: string; createdAt: string; updatedAt: string }>;
        return projects.map(p => ({
          id: p.id,
          name: p.name,
          created: p.createdAt,
          lastModified: p.updatedAt,
          columnsCount: 0,
          rowsCount: 0,
          hasEmailConfig: false,
          imageStatus: 'checking',
        }));
      }
      const projects: ProjectListItem[] = [];
      const processedIds = new Set<string>();
      
      // Process both new and old keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Check if it's either new or old format
        if (!key.startsWith(STORAGE_KEY_PREFIX) && !key.startsWith(OLD_STORAGE_KEY_PREFIX)) {
          continue;
        }
        
        try {
          const data = localStorage.getItem(key);
          if (!data) continue;
          
          const project = JSON.parse(data) as SavedProject;
          
          // Skip if we've already processed this ID (avoid duplicates)
          if (processedIds.has(project.id)) continue;
          processedIds.add(project.id);
          
          // Check if certificate image is available
          let imageStatus: ProjectListItem['imageStatus'] = 'checking';
          
          // For cloud storage, assume available (would need actual check in production)
          if (project.certificateImage.isCloudStorage) {
            imageStatus = 'available';
          } else {
            // For local storage, we can check if the URL is accessible
            // This is a simplified check - in production you'd want to actually verify
            imageStatus = project.certificateImage.url ? 'available' : 'missing';
          }
          
          projects.push({
            id: project.id,
            name: project.name,
            created: project.created,
            lastModified: project.lastModified,
            columnsCount: project.columns.length,
            rowsCount: project.tableData?.length || 0,
            hasEmailConfig: !!project.emailConfig?.isConfigured,
            imageStatus
          });
        } catch (error) {
          console.error('Error parsing project:', error);
          continue;
        }
      }
      
      // Sort by last modified date (newest first)
      return projects.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
    } catch (error) {
      console.error('Error listing projects:', error);
      return [];
    }
  }
  
  /**
   * Get the most recently modified project
   */
  static async getMostRecentProject(): Promise<SavedProject | null> {
    try {
      if (this.serverEnabled) {
        const res = await fetch('/api/projects');
        if (!res.ok) return null;
        const json = await res.json();
        const first = (json?.projects ?? [])[0];
        if (!first) return null;
        return await this.loadProjectServer(first.id);
      }
      const projects = await this.listProjects();
      
      if (projects.length === 0) {
        return null;
      }
      
      // Sort by lastModified descending
      projects.sort((a, b) => 
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );
      
      // Load and return the most recent project
      return this.loadProject(projects[0].id);
    } catch (error) {
      console.error('Error getting most recent project:', error);
      return null;
    }
  }
  
  /**
   * Check storage usage (includes both old and new keys)
   */
  static getStorageUsage(): number {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 0;
    }
    
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Count both old and new format keys
      if (!key.startsWith(STORAGE_KEY_PREFIX) && !key.startsWith(OLD_STORAGE_KEY_PREFIX)) {
        continue;
      }
      
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
   * Export project for sharing
   */
  static async exportProject(id: string, includeImage = false): Promise<{
    success: boolean;
    data?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      const project = this.loadProject(id);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }
      
      const exportData: Record<string, unknown> = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        project: { ...project }
      };
      
      // Optionally include base64 image for full portability
      if (includeImage && !project.certificateImage.isCloudStorage) {
        try {
          const response = await fetch(project.certificateImage.url);
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
      const filename = `${project.name.replace(/[^a-z0-9]/gi, '_')}_project.json`;
      
      return { success: true, data: json, filename };
    } catch (error) {
      console.error('Error exporting project:', error);
      return { success: false, error: 'Failed to export project' };
    }
  }
  
  /**
   * Import project from exported data
   */
  static async importProject(jsonData: string): Promise<{
    success: boolean;
    id?: string;
    error?: string;
  }> {
    try {
      const importData = JSON.parse(jsonData);
      
      // Validate import data - support both old "template" and new "project" format
      if (!importData.version || (!importData.project && !importData.template)) {
        return { success: false, error: 'Invalid project file' };
      }
      
      // Support both old and new format
      const project = (importData.project || importData.template) as SavedProject;
      
      // Handle embedded image if present
      if (importData.certificateImage?.base64) {
        // In a real implementation, you'd upload this to the server
        // For now, we'll just note that the image needs to be re-uploaded
        project.certificateImage.url = '';
        console.warn('Imported project contains embedded image - user will need to re-upload');
      }
      
      // Save with automatically generated new ID
      const result = await this.saveProject(
        `${project.name} (Imported)`,
        project.positions,
        project.columns,
        project.certificateImage.url,
        project.certificateImage.filename,
        project.tableData || [],
        project.emailConfig,
        {
          isCloudStorage: project.certificateImage.isCloudStorage,
          provider: project.certificateImage.storageProvider
        }
      );
      
      return result;
    } catch (error) {
      console.error('Error importing project:', error);
      return { success: false, error: 'Failed to import project' };
    }
  }
  
  /**
   * Clear all projects (use with caution)
   */
  static clearAllProjects(): void {
    const keys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(STORAGE_KEY_PREFIX) || key.startsWith(OLD_STORAGE_KEY_PREFIX))) {
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
