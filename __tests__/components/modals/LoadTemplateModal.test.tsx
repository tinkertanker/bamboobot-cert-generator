import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoadTemplateModal } from '@/components/modals/LoadTemplateModal';
import { TemplateStorage, type TemplateListItem, type SavedTemplate } from '@/lib/template-storage';

// Mock the Modal component to simplify testing
jest.mock('@/components/ui/modal', () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => 
    isOpen ? <div>{children}</div> : null
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
jest.mock('@/lib/template-storage', () => ({
  TemplateStorage: {
    listTemplates: jest.fn(),
    loadTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    exportTemplate: jest.fn(),
    importTemplate: jest.fn()
  }
}));

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('LoadTemplateModal', () => {
  const mockTemplateList: TemplateListItem[] = [
    {
      id: 'template-1',
      name: 'Template 1',
      created: '2024-01-01T10:00:00Z',
      lastModified: '2024-01-01T10:00:00Z',
      columnsCount: 3,
      hasEmailConfig: true,
      imageStatus: 'available'
    },
    {
      id: 'template-2',
      name: 'Template 2',
      created: '2024-01-02T10:00:00Z',
      lastModified: '2024-01-02T10:00:00Z',
      columnsCount: 2,
      hasEmailConfig: false,
      imageStatus: 'missing'
    }
  ];

  const mockSavedTemplate: SavedTemplate = {
    id: 'template-1',
    name: 'Template 1',
    created: '2024-01-01T10:00:00Z',
    lastModified: '2024-01-01T10:00:00Z',
    version: '1.0',
    positions: {
      name: { x: 100, y: 200, fontSize: 16, fontFamily: 'Arial', color: '#000000', align: 'center', visible: true }
    },
    columns: ['name', 'email', 'date'],
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
    onLoadTemplate: jest.fn(),
    onTemplateDeleted: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (TemplateStorage.listTemplates as jest.Mock).mockResolvedValue(mockTemplateList);
    (TemplateStorage.loadTemplate as jest.Mock).mockReturnValue(mockSavedTemplate);
  });

  it('renders when open', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    expect(screen.getByText('Load Format Template')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Template 1')).toBeInTheDocument();
      expect(screen.getByText('Template 2')).toBeInTheDocument();
    });
  });

  it('does not render when closed', () => {
    render(<LoadTemplateModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Load Format Template')).not.toBeInTheDocument();
  });

  it('loads template list on open', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(TemplateStorage.listTemplates).toHaveBeenCalled();
      expect(screen.getByText('Template 1')).toBeInTheDocument();
      expect(screen.getByText('Template 2')).toBeInTheDocument();
    });
  });

  it('displays template details correctly', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('3 columns')).toBeInTheDocument();
      expect(screen.getByText('Email configured')).toBeInTheDocument();
      expect(screen.getByText('Certificate image missing')).toBeInTheDocument();
    });
  });

  it('selects template on click', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
      
      expect(template1).toHaveClass('border-blue-500', 'bg-blue-50');
    });
  });

  it('loads selected template', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
    });
    
    const loadButton = screen.getByRole('button', { name: 'Load Template' });
    fireEvent.click(loadButton);
    
    expect(TemplateStorage.loadTemplate).toHaveBeenCalledWith('template-1');
    expect(defaultProps.onLoadTemplate).toHaveBeenCalledWith(mockSavedTemplate);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows delete confirmation', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete template');
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
    (TemplateStorage.deleteTemplate as jest.Mock).mockReturnValue(true);
    
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Delete template');
      fireEvent.click(deleteButtons[0]);
    });
    
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(TemplateStorage.deleteTemplate).toHaveBeenCalledWith('template-1');
      expect(defaultProps.onTemplateDeleted).toHaveBeenCalled();
    });
  });

  it('exports template', async () => {
    (TemplateStorage.exportTemplate as jest.Mock).mockResolvedValue({
      success: true,
      data: JSON.stringify({ template: mockSavedTemplate }),
      filename: 'template_1.json'
    });

    // Mock createElement and appendChild
    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn()
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);

    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const exportButtons = screen.getAllByTitle('Export template');
      fireEvent.click(exportButtons[0]);
    });
    
    await waitFor(() => {
      expect(TemplateStorage.exportTemplate).toHaveBeenCalledWith('template-1', true);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('template_1.json');
    });
  });

  it('imports template from file', async () => {
    (TemplateStorage.importTemplate as jest.Mock).mockResolvedValue({
      success: true,
      id: 'imported-template'
    });

    // Mock File.text() method
    const mockText = jest.fn().mockResolvedValue('{"template": {}}');
    const file = new File(['{"template": {}}'], 'template.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      value: mockText
    });
    
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const importLabel = screen.getByText('Import').closest('label');
      const importInput = importLabel?.querySelector('input[type="file"]');
      expect(importInput).toBeDefined();
      
      fireEvent.change(importInput!, { target: { files: [file] } });
    });
    
    await waitFor(() => {
      expect(mockText).toHaveBeenCalled();
      expect(TemplateStorage.importTemplate).toHaveBeenCalledWith('{"template": {}}');
      expect(TemplateStorage.listTemplates).toHaveBeenCalledTimes(2); // Once on open, once after import
    });
  });

  it('shows error when no templates found', async () => {
    (TemplateStorage.listTemplates as jest.Mock).mockResolvedValue([]);
    
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('No saved templates found')).toBeInTheDocument();
      expect(screen.getByText(/Create a template by configuring/)).toBeInTheDocument();
    });
  });

  it('handles load template error', async () => {
    (TemplateStorage.loadTemplate as jest.Mock).mockReturnValue(null);
    
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const template1 = screen.getByText('Template 1').closest('div[class*="border"]');
      fireEvent.click(template1!);
    });
    
    const loadButton = screen.getByRole('button', { name: 'Load Template' });
    fireEvent.click(loadButton);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load template')).toBeInTheDocument();
    });
  });

  it('disables load button when no template selected', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const loadButton = screen.getByRole('button', { name: 'Load Template' });
      expect(loadButton).toBeDisabled();
    });
  });

  it('closes modal on cancel', async () => {
    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('handles import error', async () => {
    (TemplateStorage.importTemplate as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Invalid template file'
    });

    const file = new File(['invalid'], 'template.json', { type: 'application/json' });
    
    render(<LoadTemplateModal {...defaultProps} />);
    
    const importInput = screen.getByLabelText(/Import/i).parentElement?.querySelector('input[type="file"]');
    
    await waitFor(() => {
      fireEvent.change(importInput!, { target: { files: [file] } });
    });
    
    await waitFor(() => {
      expect(screen.getByText('Invalid template file')).toBeInTheDocument();
    });
  });

  it('handles export error', async () => {
    (TemplateStorage.exportTemplate as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to export'
    });

    render(<LoadTemplateModal {...defaultProps} />);
    
    await waitFor(() => {
      const exportButtons = screen.getAllByTitle('Export template');
      fireEvent.click(exportButtons[0]);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Failed to export')).toBeInTheDocument();
    });
  });
});