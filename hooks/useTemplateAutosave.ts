import { useEffect, useRef, useCallback, useState } from 'react';
import { TemplateStorage } from '@/lib/template-storage';
import type { Positions, EmailConfig } from '@/types/certificate';
import { AUTOSAVE } from '@/utils/constants';

interface UseTemplateAutosaveProps {
  positions: Positions;
  columns: string[];
  emailConfig: EmailConfig | null;
  certificateImageUrl: string | null;
  certificateFilename: string | null;
  tableData: Array<Record<string, string>>;
  onAutosave?: (templateId: string) => void;
  enabled?: boolean;
  currentTemplateId?: string | null;
  currentTemplateName?: string | null;
}

interface UseTemplateAutosaveReturn {
  sessionName: string;
  lastAutosaved: Date | null;
  isAutosaving: boolean;
  manualSave: (customName: string) => Promise<{ success: boolean; id?: string; error?: string }>;
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

export function useTemplateAutosave({
  positions,
  columns,
  emailConfig,
  certificateImageUrl,
  certificateFilename,
  tableData,
  onAutosave,
  enabled = true,
  currentTemplateId = null,
  currentTemplateName = null
}: UseTemplateAutosaveProps): UseTemplateAutosaveReturn {
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
      
      if (currentTemplateId && currentTemplateName) {
        // Update existing template
        const updateResult = await TemplateStorage.updateTemplate(currentTemplateId, {
          positions,
          columns,
          tableData,
          emailConfig: emailConfig || undefined,
          certificateImage: {
            url: certificateImageUrl,
            filename: certificateFilename,
            uploadedAt: new Date().toISOString(),
            isCloudStorage: false,
          }
        });
        
        // Convert updateResult to have consistent format with saveTemplate
        result = {
          ...updateResult,
          id: updateResult.success ? currentTemplateId : undefined
        };
      } else {
        // Don't create new templates during autosave - only update existing ones
        console.warn('Autosave skipped: No current template ID or name provided. Autosave only updates existing templates.');
        return;
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
  }, [sessionName, positions, columns, emailConfig, certificateImageUrl, certificateFilename, serializeState, onAutosave, currentTemplateId, currentTemplateName]);

  // Manual save with custom name
  const manualSave = useCallback(async (customName: string) => {
    if (!certificateImageUrl || !certificateFilename) {
      return { success: false, error: 'No certificate to save' };
    }

    let result;
    
    // If we have a current template ID and the name matches, update it
    if (currentTemplateId && currentTemplateName === customName) {
      const updateResult = await TemplateStorage.updateTemplate(currentTemplateId, {
        positions,
        columns,
        tableData,
        emailConfig: emailConfig || undefined,
        certificateImage: {
          url: certificateImageUrl,
          filename: certificateFilename,
          uploadedAt: new Date().toISOString(),
          isCloudStorage: false,
        }
      });
      
      // Convert updateResult to have consistent format with saveTemplate
      result = {
        ...updateResult,
        id: updateResult.success ? currentTemplateId : undefined
      };
    } else {
      // Create new template
      result = await TemplateStorage.saveTemplate(
        customName,
        positions,
        columns,
        certificateImageUrl,
        certificateFilename,
        tableData,
        emailConfig || undefined,
        undefined // storageInfo
      );
    }

    if (result.success) {
      // Update last saved data to prevent immediate autosave
      lastSavedDataRef.current = serializeState();
      setLastAutosaved(new Date());
    }

    return result;
  }, [positions, columns, tableData, emailConfig, certificateImageUrl, certificateFilename, serializeState, currentTemplateId, currentTemplateName]);

  // Set up autosave with debounce
  useEffect(() => {
    // Clear any existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Don't autosave if disabled
    if (!enabled) {
      return;
    }

    // Don't autosave if no certificate
    if (!certificateImageUrl || !certificateFilename) {
      return;
    }

    // Don't autosave if no changes
    const currentData = serializeState();
    if (currentData === lastSavedDataRef.current) {
      return;
    }

    // Set up new timeout for autosave
    autosaveTimeoutRef.current = setTimeout(() => {
      performAutosave();
    }, AUTOSAVE.DEBOUNCE_MS);

    // Cleanup
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [performAutosave, certificateImageUrl, certificateFilename, serializeState, enabled]);

  return {
    sessionName,
    lastAutosaved,
    isAutosaving,
    manualSave
  };
}