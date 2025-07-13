import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveTemplateModal } from '@/components/modals/SaveTemplateModal';
import { TemplateStorage } from '@/lib/template-storage';
import type { Positions, EmailConfig } from '@/types/certificate';

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
    saveTemplate: jest.fn(),
    getStorageInfo: jest.fn().mockReturnValue({
      used: 1024 * 1024, // 1MB used
      limit: 5 * 1024 * 1024, // 5MB limit
      percentage: 20
    })
  }
}));

// Mock storage config
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: {
    isR2Enabled: false,
    isS3Enabled: false
  }
}));

describe('SaveTemplateModal', () => {
  const mockPositions: Positions = {
    name: { x: 100, y: 200, fontSize: 16, fontFamily: 'Arial', color: '#000000', align: 'center', visible: true }
  };
  
  const mockColumns = ['name', 'date'];
  const mockEmailConfig: EmailConfig = {
    isConfigured: true,
    provider: 'resend',
    apiKey: 'test-key',
    from: 'test@example.com',
    senderName: 'Test Sender',
    emailColumn: 'email',
    subjectTemplate: 'Your Certificate',
    bodyTemplate: 'Here is your certificate'
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    positions: mockPositions,
    columns: mockColumns,
    certificateImageUrl: '/temp_images/certificate.jpg',
    certificateFilename: 'certificate.pdf',
    onSaveSuccess: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(<SaveTemplateModal {...defaultProps} />);
    
    expect(screen.getByText('Save Format Template')).toBeInTheDocument();
    expect(screen.getByLabelText('Template Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., Annual Awards 2025')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<SaveTemplateModal {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Save Format Template')).not.toBeInTheDocument();
  });

  it('displays template information correctly', () => {
    render(<SaveTemplateModal {...defaultProps} emailConfig={mockEmailConfig} />);
    
    expect(screen.getByText('1 configured text fields')).toBeInTheDocument();
    expect(screen.getByText('2 data columns')).toBeInTheDocument();
    expect(screen.getByText('Email configuration')).toBeInTheDocument();
    // Check for "Certificate image" and "Local" separately as they're in different elements
    expect(screen.getByText(/Certificate image/)).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('saves template successfully', async () => {
    const mockSaveTemplate = TemplateStorage.saveTemplate as jest.Mock;
    mockSaveTemplate.mockResolvedValue({
      success: true,
      id: 'template-123'
    });

    render(<SaveTemplateModal {...defaultProps} />);
    
    const input = screen.getByLabelText('Template Name');
    await userEvent.type(input, 'My Test Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockSaveTemplate).toHaveBeenCalledWith(
        'My Test Template',
        mockPositions,
        mockColumns,
        '/temp_images/certificate.jpg',
        'certificate.pdf',
        undefined,
        {
          isCloudStorage: false,
          provider: 'local'
        }
      );
      expect(defaultProps.onSaveSuccess).toHaveBeenCalledWith('template-123', 'My Test Template');
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('shows error when template name is empty', async () => {
    render(<SaveTemplateModal {...defaultProps} />);
    
    // Find the button by its text content
    const buttons = screen.getAllByRole('button');
    const saveButton = buttons.find(btn => btn.textContent?.includes('Save Template'));
    expect(saveButton).toBeDefined();
    
    fireEvent.click(saveButton!);
    
    await waitFor(() => {
      expect(screen.getByText('Please enter a template name')).toBeInTheDocument();
    });
  });

  it('shows error when no certificate image', async () => {
    render(<SaveTemplateModal {...defaultProps} certificateImageUrl={undefined} />);
    
    const input = screen.getByLabelText('Template Name');
    await userEvent.type(input, 'Test Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText('No certificate image found. Please upload a certificate first.')).toBeInTheDocument();
    });
  });

  it('handles save error', async () => {
    const mockSaveTemplate = TemplateStorage.saveTemplate as jest.Mock;
    mockSaveTemplate.mockResolvedValue({
      success: false,
      error: 'Storage limit exceeded'
    });

    render(<SaveTemplateModal {...defaultProps} />);
    
    const input = screen.getByLabelText('Template Name');
    await userEvent.type(input, 'Test Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Storage limit exceeded')).toBeInTheDocument();
    });
  });

  it('displays storage usage indicator', () => {
    render(<SaveTemplateModal {...defaultProps} />);
    
    expect(screen.getByText('Browser Storage')).toBeInTheDocument();
    expect(screen.getByText('20% used')).toBeInTheDocument();
  });

  it('shows warning when storage is nearly full', () => {
    const mockGetStorageInfo = TemplateStorage.getStorageInfo as jest.Mock;
    mockGetStorageInfo.mockReturnValue({
      used: 4.5 * 1024 * 1024,
      limit: 5 * 1024 * 1024,
      percentage: 90
    });

    render(<SaveTemplateModal {...defaultProps} />);
    
    expect(screen.getByText('90% used')).toBeInTheDocument();
    expect(screen.getByText('Storage is nearly full. Consider deleting old templates.')).toBeInTheDocument();
  });

  it('disables save button when saving', async () => {
    const mockSaveTemplate = TemplateStorage.saveTemplate as jest.Mock;
    mockSaveTemplate.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(<SaveTemplateModal {...defaultProps} />);
    
    const input = screen.getByLabelText('Template Name');
    await userEvent.type(input, 'Test Template');
    
    const saveButton = screen.getByRole('button', { name: /Save Template/i });
    fireEvent.click(saveButton);
    
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('closes modal on cancel', () => {
    render(<SaveTemplateModal {...defaultProps} />);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);
    
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows cloud storage indicator when R2 is enabled', () => {
    // Clear module cache
    jest.resetModules();
    
    // Mock storage config with R2 enabled
    jest.doMock('@/lib/storage-config', () => ({
      __esModule: true,
      default: {
        isR2Enabled: true,
        isS3Enabled: false
      }
    }));

    // Re-mock UI components after module reset
    jest.doMock('@/components/ui/modal', () => ({
      Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => 
        isOpen ? <div>{children}</div> : null
    }));
    
    jest.doMock('@/components/ui/button', () => ({
      Button: ({ children, onClick, disabled, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} {...props}>
          {children}
        </button>
      )
    }));

    jest.doMock('@/lib/template-storage', () => ({
      TemplateStorage: {
        saveTemplate: jest.fn(),
        getStorageInfo: jest.fn().mockReturnValue({
          used: 1024 * 1024,
          limit: 5 * 1024 * 1024,
          percentage: 20
        })
      }
    }));

    // Re-import component to use new mocks
    const { SaveTemplateModal: SaveTemplateModalWithR2 } = require('@/components/modals/SaveTemplateModal');

    render(<SaveTemplateModalWithR2 {...defaultProps} />);
    
    // Check for "Certificate image" and "Cloud" separately as they're in different elements
    expect(screen.getByText(/Certificate image/)).toBeInTheDocument();
    expect(screen.getByText('Cloud')).toBeInTheDocument();
  });
});