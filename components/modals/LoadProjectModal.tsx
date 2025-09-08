import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ProjectStorage, type ProjectListItem, type SavedProject } from '@/lib/project-storage';
import { FileText, Trash2, Download, Upload, AlertCircle, Mail, Edit2 } from 'lucide-react';
import { escapeHtml } from '@/utils/sanitization';

interface LoadProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: SavedProject) => void;
  onProjectDeleted?: () => void;
}

export function LoadProjectModal({
  isOpen,
  onClose,
  onLoadProject,
  onProjectDeleted
}: LoadProjectModalProps) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Load projects when modal opens
  useEffect(() => {
    if (isOpen) {
      loadProjectList();
    }
  }, [isOpen]);
  
  const loadProjectList = async () => {
    setIsLoading(true);
    try {
      const list = await ProjectStorage.listProjects();
      setProjects(list);
      if (list.length === 0) {
        setError('No saved projects found');
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleLoadProject = async () => {
    if (!selectedProjectId) return;

    try {
      let project: SavedProject | null = null;
      if (ProjectStorage.isServerMode()) {
        project = await ProjectStorage.loadProjectServer(selectedProjectId);
      } else {
        project = ProjectStorage.loadProject(selectedProjectId);
      }
      if (project) {
        onLoadProject(project);
        handleClose();
      } else {
        setError('Failed to load project');
      }
    } catch (e) {
      console.error('Load project error:', e);
      setError('Failed to load project');
    }
  };
  
  const handleDeleteProject = async (id: string) => {
    setIsDeleting(id);
    try {
      const success = ProjectStorage.deleteProject(id);
      if (success) {
        await loadProjectList();
        if (selectedProjectId === id) {
          setSelectedProjectId(null);
        }
        onProjectDeleted?.();
      } else {
        setError('Failed to delete project');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      setError('Failed to delete project');
    } finally {
      setIsDeleting(null);
      setShowDeleteConfirm(null);
    }
  };
  
  const handleDeleteAllProjects = async () => {
    if (deleteAllConfirmText !== 'DELETE ALL') {
      setError('Please type "DELETE ALL" to confirm');
      return;
    }
    
    try {
      ProjectStorage.clearAllProjects();
      await loadProjectList();
      setSelectedProjectId(null);
      setShowDeleteAllConfirm(false);
      setDeleteAllConfirmText('');
      onProjectDeleted?.();
    } catch (err) {
      console.error('Error deleting all projects:', err);
      setError('Failed to delete all projects');
    }
  };
  
  const handleRenameProject = async (id: string, newName: string) => {
    if (!newName.trim()) {
      setError('Project name cannot be empty');
      return;
    }
    
    try {
      const project = ProjectStorage.loadProject(id);
      if (!project) {
        setError('Project not found');
        return;
      }
      
      const result = await ProjectStorage.updateProject(id, {
        name: newName.trim()
      });
      
      if (result.success) {
        await loadProjectList();
        setRenamingProjectId(null);
        setRenameValue('');
      } else {
        setError(result.error || 'Failed to rename project');
      }
    } catch (err) {
      console.error('Error renaming project:', err);
      setError('Failed to rename project');
    }
  };
  
  const handleExportProject = async (id: string) => {
    try {
      const result = await ProjectStorage.exportProject(id, true);
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
        setError(result.error || 'Failed to export project');
      }
    } catch (err) {
      console.error('Error exporting project:', err);
      setError('Failed to export project');
    }
  };
  
  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const result = await ProjectStorage.importProject(text);
      
      if (result.success) {
        await loadProjectList();
        setError(null);
      } else {
        setError(result.error || 'Failed to import project');
      }
    } catch (err) {
      console.error('Error importing project:', err);
      setError('Invalid project file');
    }
    
    // Reset input
    event.target.value = '';
  };
  
  const handleClose = () => {
    setSelectedProjectId(null);
    setError(null);
    setShowDeleteConfirm(null);
    setShowDeleteAllConfirm(false);
    setDeleteAllConfirmText('');
    setRenamingProjectId(null);
    setRenameValue('');
    onClose();
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };
  
  return (
    <Modal open={isOpen} onClose={handleClose} width="w-[600px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
          <div className="flex items-center gap-2">
            {projects.length > 0 && !showDeleteAllConfirm && (
              <Button 
                variant="outline" 
                size="sm" 
                className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 hover:border-red-300"
                onClick={() => setShowDeleteAllConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete All
              </Button>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                onChange={handleImportProject}
                className="hidden"
              />
              <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Import
              </Button>
            </label>
          </div>
        </div>
        
        {showDeleteAllConfirm && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">
                    Delete All Projects?
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    This will permanently delete all {projects.length} saved projects. This action cannot be undone.
                  </p>
                  <p className="text-sm text-red-700 mt-2" id="delete-all-instruction">
                    Type <span className="font-mono font-bold">DELETE ALL</span> to confirm:
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={deleteAllConfirmText}
                  onChange={(e) => setDeleteAllConfirmText(e.target.value)}
                  placeholder="Type DELETE ALL"
                  aria-label="Confirmation text for deleting all projects"
                  aria-describedby="delete-all-instruction"
                  className="flex-1 px-3 py-2 border border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDeleteAllProjects();
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    setShowDeleteAllConfirm(false);
                    setDeleteAllConfirmText('');
                    setError(null);
                  }}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteAllProjects}
                  variant="default"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={deleteAllConfirmText !== 'DELETE ALL'}
                >
                  Delete All
                </Button>
              </div>
              {error && showDeleteAllConfirm && (
                <p className="text-xs text-red-600 mt-2">{error}</p>
              )}
            </div>
          </div>
        )}
        
        {error && !isLoading && projects.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm text-amber-800">{error}</p>
                <p className="text-xs text-amber-700 mt-1">
                  Create a project by configuring your certificate and clicking &quot;Save Project&quot;
                </p>
              </div>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
          </div>
        ) : projects.length > 0 ? (
          <>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedProjectId === project.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {renamingProjectId === project.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRenameProject(project.id, renameValue);
                              } else if (e.key === 'Escape') {
                                setRenamingProjectId(null);
                                setRenameValue('');
                              }
                            }}
                            className="flex-1 px-2 py-1 text-sm font-semibold border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameProject(project.id, renameValue);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingProjectId(null);
                              setRenameValue('');
                            }}
                            className="text-xs text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <h3 
                          className="font-semibold text-gray-900 text-lg"
                          dangerouslySetInnerHTML={{ __html: escapeHtml(project.name) }}
                        />
                      )}
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500">
                          Created: {formatDate(project.created)}
                        </p>
                        {project.created !== project.lastModified && (
                          <p className="text-sm text-gray-700 font-medium">
                            Last modified: {formatDate(project.lastModified)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                            <FileText className="h-3.5 w-3.5 text-gray-500" />
                            {project.columnsCount} {project.columnsCount === 1 ? 'column' : 'columns'}
                          </span>
                          {project.rowsCount !== undefined && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span className="text-sm font-medium text-gray-700">
                                {project.rowsCount} {project.rowsCount === 1 ? 'row' : 'rows'}
                              </span>
                            </>
                          )}
                        </div>
                        {project.hasEmailConfig && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="h-3 w-3" />
                            Email configured
                          </span>
                        )}
                        {project.imageStatus === 'missing' && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Certificate image missing
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {!renamingProjectId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingProjectId(project.id);
                            setRenameValue(project.name);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                          title="Rename project"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportProject(project.id);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Export project"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {showDeleteConfirm === project.id ? (
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
                              handleDeleteProject(project.id);
                            }}
                            className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                            disabled={isDeleting === project.id}
                          >
                            {isDeleting === project.id ? 'Deleting...' : 'Confirm'}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteConfirm(project.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {error && !showDeleteAllConfirm && (
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
            onClick={handleLoadProject}
            disabled={!selectedProjectId}
          >
            Load Project
          </Button>
        </div>
      </div>
    </Modal>
  );
}
