import React, { useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ProjectStorage } from '@/lib/project-storage';
import type { Positions, EmailConfig } from '@/types/certificate';
import { AlertTriangle, Save, Cloud, HardDrive } from 'lucide-react';
import storageConfig from '@/lib/storage-config';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: Positions;
  columns: string[];
  tableData: Array<Record<string, string>>;
  emailConfig?: EmailConfig;
  certificateImageUrl?: string;
  certificateFilename?: string;
  onSaveSuccess?: (projectId: string, projectName: string) => void;
  onManualSave?: (projectName: string) => Promise<{ success: boolean; id?: string; error?: string }>;
}

export function SaveProjectModal({
  isOpen,
  onClose,
  positions,
  columns,
  tableData,
  emailConfig,
  certificateImageUrl,
  certificateFilename,
  onSaveSuccess,
  onManualSave
}: SaveProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isCloudStorage = storageConfig.isR2Enabled || storageConfig.isS3Enabled;
  const storageProvider = storageConfig.isR2Enabled ? 'r2' : storageConfig.isS3Enabled ? 's3' : 'local';
  
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!projectName.trim()) {
      setError('Please enter a project name');
      // Keep focus on the input field when showing error
      inputRef.current?.focus();
      return;
    }
    
    if (!certificateImageUrl || !certificateFilename) {
      setError('No certificate image found. Please upload a certificate first.');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      let result;
      
      if (onManualSave) {
        // Use the manual save function from the hook to prevent double save
        result = await onManualSave(projectName);
      } else {
        // Fallback to direct save
        result = await ProjectStorage.saveProject(
          projectName,
          positions,
          columns,
          certificateImageUrl,
          certificateFilename,
          tableData,
          emailConfig,
          {
            isCloudStorage,
            provider: storageProvider
          }
        );
      }
      
      if (result.success && result.id) {
        onSaveSuccess?.(result.id, projectName);
        handleClose();
      } else {
        setError(result.error || 'Failed to save project');
      }
    } catch (err) {
      console.error('Error saving project:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleClose = () => {
    setProjectName('');
    setError(null);
    onClose();
  };
  
  // Get storage info
  const storageInfo = ProjectStorage.getStorageInfo();
  const storagePercentage = storageInfo.percentage;
  const isNearLimit = storagePercentage > 80;
  
  return (
    <Modal open={isOpen} onClose={handleClose} width="w-[600px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!isSaving) {
            void handleSave();
          }
        }}
      >
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Save Project</h2>
        
        <div>
          <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-2">
            Project Name
          </label>
          <input
            id="project-name"
            type="text"
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g., Annual Awards 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            ref={inputRef}
            aria-invalid={!!error}
            aria-describedby={error ? 'project-name-error' : undefined}
          />
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Important Notes:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>This project includes all your data and formatting</li>
                <li>Saved locally in your browser</li>
                <li>Works only in this browser on this device</li>
                <li>Will be lost if you clear browser data</li>
                <li>Cannot be shared with other users directly</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            <p className="font-medium">Project will include:</p>
            <ul className="mt-1 space-y-1">
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                {Object.keys(positions || {}).length} configured text fields
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                {columns.length} data columns
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                {tableData.length} data rows
              </li>
              {emailConfig?.isConfigured && (
                <li className="flex items-center gap-2">
                  <span className="text-green-600">✓</span>
                  Email configuration
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                Certificate image ({isCloudStorage ? (
                  <span className="inline-flex items-center gap-1">
                    <Cloud className="h-3 w-3" />
                    Cloud
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Local
                  </span>
                )})
              </li>
            </ul>
          </div>
        </div>
        
        {/* Storage usage indicator */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Browser Storage</span>
            <span>{storagePercentage}% used</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                isNearLimit ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(storagePercentage, 100)}%` }}
            />
          </div>
          {isNearLimit && (
            <p className="text-xs text-amber-600">
              Storage is nearly full. Consider deleting old projects.
            </p>
          )}
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p id="project-name-error" className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={handleClose}
            variant="outline"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !projectName.trim()}
            className="inline-flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Project
              </>
            )}
          </Button>
        </div>
      </div>
      </form>
    </Modal>
  );
}
