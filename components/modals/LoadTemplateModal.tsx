import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { TemplateStorage, type TemplateListItem, type SavedTemplate } from '@/lib/template-storage';
import { FileText, Trash2, Download, Upload, AlertCircle, Mail } from 'lucide-react';

interface LoadTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTemplate: (template: SavedTemplate) => void;
  onTemplateDeleted?: () => void;
}

export function LoadTemplateModal({
  isOpen,
  onClose,
  onLoadTemplate,
  onTemplateDeleted
}: LoadTemplateModalProps) {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  
  // Load templates when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTemplateList();
    }
  }, [isOpen]);
  
  const loadTemplateList = async () => {
    setIsLoading(true);
    try {
      const list = await TemplateStorage.listTemplates();
      setTemplates(list);
      if (list.length === 0) {
        setError('No saved templates found');
      }
    } catch (err) {
      console.error('Error loading templates:', err);
      setError('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleLoadTemplate = () => {
    if (!selectedTemplateId) return;
    
    const template = TemplateStorage.loadTemplate(selectedTemplateId);
    if (template) {
      onLoadTemplate(template);
      handleClose();
    } else {
      setError('Failed to load template');
    }
  };
  
  const handleDeleteTemplate = async (id: string) => {
    setIsDeleting(id);
    try {
      const success = TemplateStorage.deleteTemplate(id);
      if (success) {
        await loadTemplateList();
        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
        }
        onTemplateDeleted?.();
      } else {
        setError('Failed to delete template');
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete template');
    } finally {
      setIsDeleting(null);
      setShowDeleteConfirm(null);
    }
  };
  
  const handleExportTemplate = async (id: string) => {
    try {
      const result = await TemplateStorage.exportTemplate(id, true);
      if (result.success && result.data && result.filename) {
        // Create and download file
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setError(result.error || 'Failed to export template');
      }
    } catch (err) {
      console.error('Error exporting template:', err);
      setError('Failed to export template');
    }
  };
  
  const handleImportTemplate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const result = await TemplateStorage.importTemplate(text);
      
      if (result.success) {
        await loadTemplateList();
        setError(null);
      } else {
        setError(result.error || 'Failed to import template');
      }
    } catch (err) {
      console.error('Error importing template:', err);
      setError('Invalid template file');
    }
    
    // Reset input
    event.target.value = '';
  };
  
  const handleClose = () => {
    setSelectedTemplateId(null);
    setError(null);
    setShowDeleteConfirm(null);
    onClose();
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <Modal open={isOpen} onClose={handleClose} width="w-[600px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Load Format Template</h2>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".json"
              onChange={handleImportTemplate}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import
            </Button>
          </label>
        </div>
        
        {error && !isLoading && templates.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800">{error}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Create a template by configuring your certificate and clicking &quot;Save Template&quot;
                </p>
              </div>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          </div>
        ) : templates.length > 0 ? (
          <>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedTemplateId === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{template.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Created: {formatDate(template.created)}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {template.columnsCount} columns
                        </span>
                        {template.hasEmailConfig && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            Email configured
                          </span>
                        )}
                        {template.imageStatus === 'missing' && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Certificate image missing
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportTemplate(template.id);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Export template"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {showDeleteConfirm === template.id ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDeleteConfirm(null);
                            }}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTemplate(template.id);
                            }}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                            disabled={isDeleting === template.id}
                          >
                            {isDeleting === template.id ? 'Deleting...' : 'Confirm'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(template.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete template"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </>
        ) : null}
        
        <div className="flex justify-end gap-3">
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={handleLoadTemplate}
            disabled={!selectedTemplateId}
          >
            Load Template
          </Button>
        </div>
      </div>
    </Modal>
  );
}