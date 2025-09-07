import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoadProjectModal } from '@/components/modals/LoadProjectModal';
import { ProjectStorage, type ProjectListItem, type SavedProject } from '@/lib/project-storage';

// Mock the Modal component to simplify testing
jest.mock('@/components/ui/modal', () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) => 
    open ? <div>{children}</div> : null
}));

// Mock the Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )
}));

// Mock the template storage
jest.mock('@/lib/project-storage', () => ({
  ProjectStorage: {
    listProjects: jest.fn(),
    loadProject: jest.fn(),
    deleteProject: jest.fn(),
    exportProject: jest.fn(),
    importProject: jest.fn(),
    clearAllProjects: jest.fn(),
    updateProject: jest.fn()
  }
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('LoadProjectModal', () => {
  const mockProjectList: ProjectListItem[] = [
    {
      id: 'template-1',
      name: 'Template 1',
      created: '2024-01-01T10:00:00Z',
      lastModified: '2024-01-01T10:00:00Z',
      columnsCount: 3,
      rowsCount: 2,
      hasEmailConfig: true,
      imageStatus: 'available'
    },
    {
      id: 'template-2',
      name: 'Template 2',
      created: '2024-01-02T10:00:00Z',
      lastModified: '2024-01-02T10:00:00Z',
      columnsCount: 2,
      rowsCount: 1,
      hasEmailConfig: false,
      imageStatus: 'missing'
    }
  ];

  const mockSavedProject: SavedProject = {
    id: 'template-1',
    name: 'Template 1',
    created: '2024-01-01T10:00:00Z',
    lastModified: '2024-01-01T10:00:00Z',
    version: '1.0',
    positions: {
      name: { x: 100, y: 200, fontSize: 16, fontFamily: 'Arial', color: '#000000', align: 'center', visible: true }
    },
    columns: ['name', 'email', 'date'],
    tableData: [
      { name: 'John Doe', email: 'john@example.com', date: '2024-01-01' },
      { name: 'Jane Smith', email: 'jane@example.com', date: '2024-01-02' }
    ],
    emailConfig: {
      isConfigured: true,
      provider: 'resend',
      apiKey: 'test-key',
      from: 'test@example.com',
      senderName: 'Test Sender',
      emailColumn: 'email',
      subjectTemplate: 'Your Certificate',
      bodyTemplate: 'Here is your certificate'
    },
    certificateImage: {
      url: '/temp_images/certificate.jpg',
      filename: 'certificate.pdf',
      uploadedAt: '2024-01-01T10:00:00Z',
      isCloudStorage: false
    }
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onLoadProject: jest.fn(),
    onProjectDeleted: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (ProjectStorage.listProjects as jest.Mock).mockResolvedValue(mockProjectList);
    (ProjectStorage.loadProject as jest.Mock).mockReturnValue(mockSavedProject);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders when open', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    expect(screen.getByText('Projects')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Template 1')).toBeInTheDocument();
      expect(screen.getByText('Template 2')).toBeInTheDocument();
    });
  });

  it('does not render when closed', () => {
    render(<LoadProjectModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });

  it('loads template list on open', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(ProjectStorage.listProjects).toHaveBeenCalled();
      expect(screen.getByText('Template 1')).toBeInTheDocument();
      expect(screen.getByText('Template 2')).toBeInTheDocument();
    });
  });

  it('displays template details correctly', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('3 columns')).toBeInTheDocument();
      expect(screen.getByText('Email configured')).toBeInTheDocument();
      expect(screen.getByText('Certificate image missing')).toBeInTheDocument();
    });
  });

  it('selects template on click', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
      
      expect(template1).toHaveClass('border-blue-500', 'bg-blue-50');
    });
  });

  it('loads selected template', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
    });
    
    const loadButton = screen.getByRole('button', { name: 'Load Project' });
    fireEvent.click(loadButton);
    
    expect(ProjectStorage.loadProject).toHaveBeenCalledWith('template-1');
    expect(defaultProps.onLoadProject).toHaveBeenCalledWith(mockSavedProject);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows delete confirmation', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete project');
      fireEvent.click(deleteButtons[0]);
    });
    
    // Look for the small cancel/confirm buttons, not the main Cancel button
    const buttons = screen.getAllByRole('button');
    const cancelButton = buttons.find(btn => btn.textContent === 'Cancel' && btn.className.includes('text-xs'));
    const confirmButton = buttons.find(btn => btn.textContent === 'Confirm');
    
    expect(cancelButton).toBeInTheDocument();
    expect(confirmButton).toBeInTheDocument();
  });

  it('deletes template after confirmation', async () => {
    (ProjectStorage.deleteProject as jest.Mock).mockReturnValue(true);
    
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete project');
      fireEvent.click(deleteButtons[0]);
    });
    
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(ProjectStorage.deleteProject).toHaveBeenCalledWith('template-1');
      expect(defaultProps.onProjectDeleted).toHaveBeenCalled();
    });
  });

  it('exports template', async () => {
    (ProjectStorage.exportProject as jest.Mock).mockResolvedValue({
      success: true,
      data: JSON.stringify({ project: mockSavedProject }),
      filename: 'project_1.json'
    });

    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const exportButtons = screen.getAllByTitle('Export project');
      fireEvent.click(exportButtons[0]);
    });
    
    await waitFor(() => {
      expect(ProjectStorage.exportProject).toHaveBeenCalledWith('template-1', true);
    });
  });

  it('imports template from file', async () => {
    (ProjectStorage.importProject as jest.Mock).mockResolvedValue({
      success: true,
      id: 'imported-template'
    });

    // Mock File.text() method
    const mockText = jest.fn().mockResolvedValue('{"project": {}}');
    const file = new File(['{"project": {}}'], 'project.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: mockText
    });
    
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const importLabel = screen.getByText('Import').closest('label');
      const importInput = importLabel?.querySelector('input[type="file"]');
      expect(importInput).toBeDefined();
      
      fireEvent.change(importInput!, { target: { files: [file] } });
    });
    
    await waitFor(() => {
      expect(mockText).toHaveBeenCalled();
      expect(ProjectStorage.importProject).toHaveBeenCalledWith('{"project": {}}');
      expect(ProjectStorage.listProjects).toHaveBeenCalledTimes(2); // Once on open, once after import
    });
  });

  it('shows error when no templates found', async () => {
    (ProjectStorage.listProjects as jest.Mock).mockResolvedValue([]);
    
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('No saved projects found')).toBeInTheDocument();
      expect(screen.getByText(/Create a project by configuring/)).toBeInTheDocument();
    });
  });

  it('handles load template error', async () => {
    (ProjectStorage.loadProject as jest.Mock).mockReturnValue(null);
    
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
    });
    
    const loadButton = screen.getByRole('button', { name: 'Load Project' });
    fireEvent.click(loadButton);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load project')).toBeInTheDocument();
    });
  });

  it('disables load button when no template selected', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const loadButton = screen.getByRole('button', { name: 'Load Project' });
      expect(loadButton).toBeDisabled();
    });
  });

  it('closes modal on cancel', async () => {
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('handles import error', async () => {
    (ProjectStorage.importProject as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Invalid project file'
    });

    const file = new File(['invalid'], 'project.json', { type: 'application/json' });
    
    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const importButton = screen.getByText('Import');
      const importLabel = importButton.closest('label');
      const importInput = importLabel?.querySelector('input[type="file"]');
      expect(importInput).toBeDefined();
      
      fireEvent.change(importInput!, { target: { files: [file] } });
    });
    
    await waitFor(() => {
      expect(screen.getByText('Invalid project file')).toBeInTheDocument();
    });
  });

  it('handles export error', async () => {
    (ProjectStorage.exportProject as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to export'
    });

    render(<LoadProjectModal {...defaultProps} />);
    
    await waitFor(() => {
      const exportButtons = screen.getAllByTitle('Export project');
      fireEvent.click(exportButtons[0]);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Failed to export')).toBeInTheDocument();
    });
  });
});