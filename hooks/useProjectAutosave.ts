import { useEffect, useRef, useCallback, useState } from 'react';
import { ProjectStorage } from '@/lib/project-storage';
import type { Positions, EmailConfig } from '@/types/certificate';
import { AUTOSAVE } from '@/utils/constants';

interface UseProjectAutosaveProps {
  positions: Positions;
  columns: string[];
  emailConfig: EmailConfig | null;
  certificateImageUrl: string | null;
  certificateFilename: string | null;
  tableData: Array<Record<string, string>>;
  onAutosave?: (projectId: string) => void;
  enabled?: boolean;
  currentProjectId?: string | null;
  currentProjectName?: string | null;
}

interface UseProjectAutosaveReturn {
  sessionName: string;
  lastAutosaved: Date | null;
  isAutosaving: boolean;
  manualSave: (customName: string, overrideUrl?: string, overrideFilename?: string) => Promise<{ success: boolean; id?: string; error?: string }>;
}

// Generate session name on hook initialization
const generateSessionName = () => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
  return `Session ${dateStr} ${timeStr}`;
};

export function useProjectAutosave({
  positions,
  columns,
  emailConfig,
  certificateImageUrl,
  certificateFilename,
  tableData,
  onAutosave,
  enabled = true,
  currentProjectId = null,
  currentProjectName = null
}: UseProjectAutosaveProps): UseProjectAutosaveReturn {
  const [sessionName] = useState(() => generateSessionName());
  const [lastAutosaved, setLastAutosaved] = useState<Date | null>(null);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');

  // Serialize current state for comparison
  const serializeState = useCallback(() => {
    return JSON.stringify({
      positions,
      columns,
      emailConfig,
      certificateImageUrl,
      certificateFilename,
      tableData
    });
  }, [positions, columns, emailConfig, certificateImageUrl, certificateFilename, tableData]);

  // Perform autosave
  const performAutosave = useCallback(async () => {
    if (!certificateImageUrl || !certificateFilename) {
      return;
    }

    const currentData = serializeState();
    
    // Don't save if nothing changed
    if (currentData === lastSavedDataRef.current) {
      return;
    }

    setIsAutosaving(true);
    
    try {
      let result;
      
      if (currentProjectId && currentProjectName) {
        // Update existing project
        const updateResult = await ProjectStorage.updateProject(currentProjectId, {
          positions,
          columns,
          tableData,
          emailConfig: emailConfig || undefined,
          certificateImage: {
            url: certificateImageUrl,
            filename: certificateFilename,
            uploadedAt: new Date().toISOString(),
            isCloudStorage: false,
            storageProvider: 'local'
          }
        });
        
        result = { success: updateResult.success, id: currentProjectId, error: updateResult.error };
      } else {
        // Create new autosave session
        result = await ProjectStorage.saveProject(
          sessionName,
          positions,
          columns,
          certificateImageUrl,
          certificateFilename,
          tableData,
          emailConfig || undefined,
          { isCloudStorage: false, provider: 'local' }
        );
      }
      
      if (result.success && result.id) {
        lastSavedDataRef.current = currentData;
        setLastAutosaved(new Date());
        onAutosave?.(result.id);
      }
    } catch (error) {
      console.error('Autosave failed:', error);
    } finally {
      setIsAutosaving(false);
    }
  }, [
    positions,
    columns,
    emailConfig,
    certificateImageUrl,
    certificateFilename,
    tableData,
    sessionName,
    currentProjectId,
    currentProjectName,
    serializeState,
    onAutosave
  ]);

  // Manual save function
  const manualSave = useCallback(async (
    customName: string,
    overrideUrl?: string,
    overrideFilename?: string
  ): Promise<{ success: boolean; id?: string; error?: string }> => {
    const url = overrideUrl || certificateImageUrl;
    const filename = overrideFilename || certificateFilename;
    
    if (!url || !filename) {
      return { success: false, error: 'No certificate image to save' };
    }

    try {
      let result;
      
      if (currentProjectId && customName === currentProjectName) {
        // Update existing project
        const updateResult = await ProjectStorage.updateProject(currentProjectId, {
          positions,
          columns,
          tableData,
          emailConfig: emailConfig || undefined,
          certificateImage: {
            url,
            filename,
            uploadedAt: new Date().toISOString(),
            isCloudStorage: false,
            storageProvider: 'local'
          }
        });
        
        result = { success: updateResult.success, id: currentProjectId, error: updateResult.error };
      } else {
        // Save as new project
        result = await ProjectStorage.saveProject(
          customName,
          positions,
          columns,
          url,
          filename,
          tableData,
          emailConfig || undefined,
          { isCloudStorage: false, provider: 'local' }
        );
      }
      
      if (result.success) {
        lastSavedDataRef.current = serializeState();
        setLastAutosaved(new Date());
      }
      
      return result;
    } catch (error) {
      console.error('Manual save failed:', error);
      return { success: false, error: 'Failed to save project' };
    }
  }, [
    positions,
    columns,
    emailConfig,
    certificateImageUrl,
    certificateFilename,
    tableData,
    currentProjectId,
    currentProjectName,
    serializeState
  ]);

  // Set up autosave
  useEffect(() => {
    if (!enabled || !certificateImageUrl || !certificateFilename) {
      return;
    }

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Set new timeout
    autosaveTimeoutRef.current = setTimeout(() => {
      performAutosave();
    }, AUTOSAVE.DEBOUNCE_MS);

    // Cleanup
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [enabled, performAutosave, certificateImageUrl, certificateFilename]);

  return {
    sessionName,
    lastAutosaved,
    isAutosaving,
    manualSave
  };
}