import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { TemplateStorage } from '@/lib/template-storage';
import type { Positions, EmailConfig } from '@/types/certificate';
import { AlertTriangle, Save, Cloud, HardDrive } from 'lucide-react';
import storageConfig from '@/lib/storage-config';

interface SaveTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  positions: Positions;
  columns: string[];
  emailConfig?: EmailConfig;
  certificateImageUrl?: string;
  certificateFilename?: string;
  onSaveSuccess?: (templateId: string, templateName: string) => void;
}

export function SaveTemplateModal({
  isOpen,
  onClose,
  positions,
  columns,
  emailConfig,
  certificateImageUrl,
  certificateFilename,
  onSaveSuccess
}: SaveTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isCloudStorage = storageConfig.isR2Enabled || storageConfig.isS3Enabled;
  const storageProvider = storageConfig.isR2Enabled ? 'r2' : storageConfig.isS3Enabled ? 's3' : 'local';
  
  const handleSave = async () => {
    if (!templateName.trim()) {
      setError('Please enter a template name');
      return;
    }
    
    if (!certificateImageUrl || !certificateFilename) {
      setError('No certificate image found. Please upload a certificate first.');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      const result = await TemplateStorage.saveTemplate(
        templateName,
        positions,
        columns,
        certificateImageUrl,
        certificateFilename,
        emailConfig,
        {
          isCloudStorage,
          provider: storageProvider
        }
      );
      
      if (result.success && result.id) {
        onSaveSuccess?.(result.id, templateName);
        handleClose();
      } else {
        setError(result.error || 'Failed to save template');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleClose = () => {
    setTemplateName('');
    setError(null);
    onClose();
  };
  
  // Get storage info
  const storageInfo = TemplateStorage.getStorageInfo();
  const storagePercentage = storageInfo.percentage;
  const isNearLimit = storagePercentage > 80;
  
  return (
    <Modal open={isOpen} onClose={handleClose} width="w-[600px]">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Save Format Template</h2>
        
        <div>
          <label htmlFor="template-name" className="block text-sm font-medium text-gray-700 mb-2">
            Template Name
          </label>
          <input
            id="template-name"
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g., Annual Awards 2025"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Important Notes:</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>This template will be saved locally in your browser</li>
                <li>Works only in this browser on this device</li>
                <li>Will be lost if you clear browser data</li>
                <li>Cannot be shared with other users directly</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            <p className="font-medium">Template will include:</p>
            <ul className="mt-1 space-y-1">
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                {Object.keys(positions).length} configured text fields
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                {columns.length} data columns
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
              Storage is nearly full. Consider deleting old templates.
            </p>
          )}
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !templateName.trim()}
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
                Save Template
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}