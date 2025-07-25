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
  onAutosave?: (templateId: string) => void;
  enabled?: boolean;
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
  onAutosave,
  enabled = true
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
      certificateFilename
    });
  }, [positions, columns, emailConfig, certificateImageUrl, certificateFilename]);

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
      const result = await TemplateStorage.saveTemplate(
        sessionName,
        positions,
        columns,
        certificateImageUrl,
        certificateFilename,
        emailConfig || undefined
      );

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
  }, [sessionName, positions, columns, emailConfig, certificateImageUrl, certificateFilename, serializeState, onAutosave]);

  // Manual save with custom name
  const manualSave = useCallback(async (customName: string) => {
    if (!certificateImageUrl || !certificateFilename) {
      return { success: false, error: 'No certificate to save' };
    }

    const result = await TemplateStorage.saveTemplate(
      customName,
      positions,
      columns,
      certificateImageUrl,
      certificateFilename,
      emailConfig || undefined
    );

    if (result.success) {
      // Update last saved data to prevent immediate autosave
      lastSavedDataRef.current = serializeState();
      setLastAutosaved(new Date());
    }

    return result;
  }, [positions, columns, emailConfig, certificateImageUrl, certificateFilename, serializeState]);

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