import { useEffect, useRef } from 'react';
import { SessionStorage } from '@/lib/session-storage';
import type { TableData } from '@/types/certificate';
import { AUTOSAVE } from '@/utils/constants';

interface UseSessionAutosaveProps {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  enabled?: boolean;
}

export function useSessionAutosave({
  tableData,
  tableInput,
  isFirstRowHeader,
  useCSVMode,
  enabled = true
}: UseSessionAutosaveProps) {
  const autosaveTimeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');
  
  useEffect(() => {
    if (!enabled) return;
    
    // Clear any existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    
    // Set up new timeout for autosave. Serialization happens inside the
    // debounced callback so typing doesn't stringify the whole table per keystroke.
    autosaveTimeoutRef.current = setTimeout(() => {
      const currentData = JSON.stringify({
        tableData,
        tableInput,
        isFirstRowHeader,
        useCSVMode
      });

      // Don't save if nothing changed
      if (currentData === lastSavedDataRef.current) {
        return;
      }

      const saved = SessionStorage.saveSession({
        tableData,
        tableInput,
        isFirstRowHeader,
        useCSVMode
      });
      
      if (saved) {
        lastSavedDataRef.current = currentData;
      }
    }, AUTOSAVE.DEBOUNCE_MS);
    
    // Cleanup
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [tableData, tableInput, isFirstRowHeader, useCSVMode, enabled]);
  
  // Save immediately on unmount
  useEffect(() => {
    return () => {
      if (enabled && tableData.length > 0) {
        SessionStorage.saveSession({
          tableData,
          tableInput,
          isFirstRowHeader,
          useCSVMode
        });
      }
    };
  }, []);
}