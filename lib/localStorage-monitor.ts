/**
 * localStorage Monitoring and Cleanup Utilities
 * 
 * Provides utilities to analyze and clean up localStorage usage in Dev Mode
 */

export interface LocalStorageItem {
  key: string;
  size: number;
  type: 'project' | 'session' | 'email-queue' | 'other';
  data?: Record<string, unknown>;
  lastModified?: string;
}

export interface LocalStorageStats {
  totalSize: number;
  totalItems: number;
  quotaUsage: number; // Percentage of localStorage quota used
  items: LocalStorageItem[];
  byType: {
    projects: { count: number; size: number; items: LocalStorageItem[] };
    session: { count: number; size: number; items: LocalStorageItem[] };
    emailQueues: { count: number; size: number; items: LocalStorageItem[] };
    other: { count: number; size: number; items: LocalStorageItem[] };
  };
}

// Helper function to estimate localStorage quota (usually 5-10MB in most browsers)
function estimateLocalStorageQuota(): number {
  try {
    const testKey = '__quota_test__';
    let size = 0;
    const testValue = '0'.repeat(1024); // 1KB test string
    
    // Try to fill localStorage to find the limit
    while (size < 10 * 1024 * 1024) { // Max 10MB test
      try {
        localStorage.setItem(testKey + size, testValue);
        size += 1024;
      } catch {
        break;
      }
    }
    
    // Clean up test data
    for (let i = 0; i < size; i += 1024) {
      localStorage.removeItem(testKey + i);
    }
    
    return size || 5 * 1024 * 1024; // Default to 5MB if test fails
  } catch {
    return 5 * 1024 * 1024; // Default to 5MB
  }
}

function getItemType(key: string): LocalStorageItem['type'] {
  if (key.startsWith('bamboobot_template_v1_')) return 'project';
  if (key === 'bamboobot_current_session_v1') return 'session';
  if (key.startsWith('email-queue-')) return 'email-queue';
  return 'other';
}

function getItemSize(value: string): number {
  // Rough estimate: each character is ~2 bytes in UTF-16
  return new Blob([value]).size;
}

function parseItemData(key: string, value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    
    // Add helpful metadata based on type
    if (key.startsWith('bamboobot_template_v1_')) {
      return {
        name: parsed.name || 'Unnamed Project',
        created: parsed.created,
        lastModified: parsed.lastModified,
        dataRows: parsed.tableData?.length || 0,
        textFields: Object.keys(parsed.positions || {}).length,
        hasEmailConfig: !!parsed.emailConfig
      };
    } else if (key === 'bamboobot_current_session_v1') {
      return {
        dataRows: parsed.tableData?.length || 0,
        lastModified: parsed.lastModified,
        csvMode: parsed.useCSVMode,
        hasHeader: parsed.isFirstRowHeader
      };
    } else if (key.startsWith('email-queue-')) {
      return {
        sessionId: key.replace('email-queue-', ''),
        totalEmails: parsed.emails?.length || 0,
        completed: parsed.emails?.filter((e: { status: string }) => e.status === 'sent').length || 0,
        failed: parsed.emails?.filter((e: { status: string }) => e.status === 'error').length || 0,
        lastModified: parsed.updatedAt
      };
    }
    
    return parsed;
  } catch {
    return { raw: value.substring(0, 100) + (value.length > 100 ? '...' : '') };
  }
}

export function analyzeLocalStorage(): LocalStorageStats {
  const items: LocalStorageItem[] = [];
  let totalSize = 0;
  
  // Analyze all localStorage items
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    const value = localStorage.getItem(key);
    if (!value) continue;
    
    const size = getItemSize(value);
    const type = getItemType(key);
    const data = parseItemData(key, value);
    
    const item: LocalStorageItem = {
      key,
      size,
      type,
      data,
      lastModified: data?.lastModified || data?.updatedAt
    };
    
    items.push(item);
    totalSize += size;
  }
  
  // Sort by size (largest first)
  items.sort((a, b) => b.size - a.size);
  
  // Group by type
  const byType = {
    projects: { count: 0, size: 0, items: [] as LocalStorageItem[] },
    session: { count: 0, size: 0, items: [] as LocalStorageItem[] },
    emailQueues: { count: 0, size: 0, items: [] as LocalStorageItem[] },
    other: { count: 0, size: 0, items: [] as LocalStorageItem[] }
  };
  
  items.forEach(item => {
    switch (item.type) {
      case 'project':
        byType.projects.count++;
        byType.projects.size += item.size;
        byType.projects.items.push(item);
        break;
      case 'session':
        byType.session.count++;
        byType.session.size += item.size;
        byType.session.items.push(item);
        break;
      case 'email-queue':
        byType.emailQueues.count++;
        byType.emailQueues.size += item.size;
        byType.emailQueues.items.push(item);
        break;
      default:
        byType.other.count++;
        byType.other.size += item.size;
        byType.other.items.push(item);
    }
  });
  
  const quota = estimateLocalStorageQuota();
  const quotaUsage = (totalSize / quota) * 100;
  
  return {
    totalSize,
    totalItems: items.length,
    quotaUsage,
    items,
    byType
  };
}

export interface CleanupOptions {
  target: 'all' | 'projects' | 'session' | 'email-queues' | 'old-projects' | 'old-email-queues';
  olderThanDays?: number;
}

export function cleanupLocalStorage(options: CleanupOptions): { deletedCount: number; freedSize: number; deletedItems: string[] } {
  const stats = analyzeLocalStorage();
  const result = { deletedCount: 0, freedSize: 0, deletedItems: [] as string[] };
  
  const now = new Date();
  const cutoffDate = options.olderThanDays 
    ? new Date(now.getTime() - (options.olderThanDays * 24 * 60 * 60 * 1000))
    : null;
  
  stats.items.forEach(item => {
    let shouldDelete = false;
    
    switch (options.target) {
      case 'all':
        shouldDelete = true;
        break;
      case 'projects':
        shouldDelete = item.type === 'project';
        break;
      case 'session':
        shouldDelete = item.type === 'session';
        break;
      case 'email-queues':
        shouldDelete = item.type === 'email-queue';
        break;
      case 'old-projects':
        if (item.type === 'project' && item.lastModified && cutoffDate) {
          shouldDelete = new Date(item.lastModified) < cutoffDate;
        }
        break;
      case 'old-email-queues':
        if (item.type === 'email-queue' && item.lastModified && cutoffDate) {
          shouldDelete = new Date(item.lastModified) < cutoffDate;
        }
        break;
    }
    
    if (shouldDelete) {
      localStorage.removeItem(item.key);
      result.deletedCount++;
      result.freedSize += item.size;
      result.deletedItems.push(`${item.key} (${formatBytes(item.size)})`);
    }
  });
  
  return result;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}