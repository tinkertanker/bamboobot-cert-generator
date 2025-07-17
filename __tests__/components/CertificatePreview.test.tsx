import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CertificatePreview } from '@/components/CertificatePreview';
import type { CertificatePreviewProps, TableData, Positions, DragInfo, CenterGuideState } from '@/types/certificate';

// Mock the Spinner component
jest.mock('@/components/Spinner', () => ({
  __esModule: true,
  default: () => <div data-testid="spinner">Loading...</div>
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  EyeOff: ({ className }: { className?: string }) => (
    <svg data-testid="eye-off" className={className}>EyeOff</svg>
  )
}));

// Mock COLORS
jest.mock('@/utils/styles', () => ({
  COLORS: {
    coral: '#E76F51',
    primaryMedium: '#2d6a4f',
    borderGray: '#d1d5db',
    grayLight: '#f9fafb',
    highlightBg: '#fff3e0'
  }
}));

describe('CertificatePreview', () => {
  const mockSetSelectedField = jest.fn();
  const mockHandlePointerDown = jest.fn();
  const mockHandlePointerUp = jest.fn();
  const mockSetShowCenterGuide = jest.fn();
  const mockHandleDragOver = jest.fn();
  const mockHandleDragLeave = jest.fn();
  const mockHandleFileDrop = jest.fn();
  const mockHandleFileUpload = jest.fn();

  const defaultProps: CertificatePreviewProps = {
    uploadedFileUrl: null,
    isLoading: false,
    tableData: [],
    currentPreviewIndex: 0,
    positions: {},
    selectedField: null,
    setSelectedField: mockSetSelectedField,
    isDragging: false,
    dragInfo: null,
    showCenterGuide: { horizontal: false, vertical: false },
    handlePointerDown: mockHandlePointerDown,
    handlePointerUp: mockHandlePointerUp,
    setShowCenterGuide: mockSetShowCenterGuide,
    isDraggingFile: false,
    handleDragOver: mockHandleDragOver,
    handleDragLeave: mockHandleDragLeave,
    handleFileDrop: mockHandleFileDrop,
    handleFileUpload: mockHandleFileUpload
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('renders upload area when no image is uploaded', () => {
      render(<CertificatePreview {...defaultProps} />);
      expect(screen.getByText('Choose File or Drag & Drop (JPEG or PNG)')).toBeInTheDocument();
    });

    it('shows drag state when file is being dragged', () => {
      render(<CertificatePreview {...defaultProps} isDraggingFile={true} />);
      expect(screen.getByText('Drop your image here')).toBeInTheDocument();
    });

    it('renders spinner when loading', () => {
      render(<CertificatePreview {...defaultProps} isLoading={true} />);
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  describe('Image Display', () => {
    it('displays uploaded image', () => {
      const uploadedUrl = 'https://example.com/certificate.jpg';
      render(<CertificatePreview {...defaultProps} uploadedFileUrl={uploadedUrl} />);
      
      const img = screen.getByAltText('Certificate Template');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', uploadedUrl);
    });

    it('renders with proper border styling', () => {
      render(<CertificatePreview {...defaultProps} uploadedFileUrl="test.jpg" />);
      const borderDiv = screen.getByAltText('Certificate Template').parentElement;
      expect(borderDiv).toHaveClass('border-4', 'border-gray-700');
    });
  });

  describe('Text Field Rendering', () => {
    const mockTableData: TableData[] = [
      { name: 'John Doe', title: 'Certificate of Excellence' },
      { name: 'Jane Smith', title: 'Achievement Award' }
    ];

    const mockPositions: Positions = {
      name: { x: 50, y: 30, fontSize: 24, fontFamily: 'Helvetica' },
      title: { x: 50, y: 70, fontSize: 18, fontFamily: 'Times', isVisible: false }
    };

    it('renders text fields from table data', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
        />
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Certificate of Excellence')).toBeInTheDocument();
    });

    it('applies position styling correctly', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
        />
      );

      const nameField = screen.getByText('John Doe');
      // The text is inside a div with data-key attribute
      const fieldContainer = nameField.closest('[data-key="name"]');
      expect(fieldContainer).toHaveStyle({
        left: '50%',
        top: '30%',
        fontSize: '24px'
      });
    });

    it('shows hidden field indicator', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
        />
      );

      const titleField = screen.getByText('Certificate of Excellence').closest('[data-key="title"]');
      expect(titleField).toHaveStyle({ opacity: '0.3' });
      expect(titleField?.querySelector('[data-testid="eye-off"]')).toBeInTheDocument();
    });

    it('displays data from current preview index', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
          currentPreviewIndex={1}
        />
      );

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Achievement Award')).toBeInTheDocument();
    });
  });

  describe('Text Formatting', () => {
    const mockTableData: TableData[] = [{ name: 'Test User' }];

    it('applies font styling', () => {
      const positions: Positions = {
        name: {
          x: 50,
          y: 50,
          fontFamily: 'Montserrat',
          bold: true,
          italic: true,
          color: '#FF0000'
        }
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={positions}
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      expect(textField).toHaveStyle({
        fontWeight: 'bold',
        fontStyle: 'italic',
        color: '#FF0000'
      });
    });

    it('applies text alignment', () => {
      const positions: Positions = {
        name: { x: 50, y: 50, alignment: 'right' }
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={positions}
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      expect(textField).toHaveStyle({
        transform: 'translate(-100%, -50%)'
      });
    });
  });

  describe('Selection and Dragging', () => {
    const mockTableData: TableData[] = [{ name: 'Test User' }];
    const mockPositions: Positions = {
      name: { x: 50, y: 50 }
    };

    it('highlights selected field', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
          selectedField="name"
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      expect(textField).toHaveStyle({
        border: '2px solid #2d6a4f',
        backgroundColor: 'rgba(45, 106, 79, 0.15)'
      });
    });

    it('shows dragging state', () => {
      const dragInfo: DragInfo = {
        key: 'name',
        offsetX: 10,
        offsetY: 10,
        pointerId: 1
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
          isDragging={true}
          dragInfo={dragInfo}
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      expect(textField).toHaveStyle({
        cursor: 'grabbing',
        border: '2px solid #E76F51',
        backgroundColor: 'rgba(231, 111, 81, 0.15)'
      });
    });

    it('handles pointer down event', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]') as HTMLElement;
      fireEvent.pointerDown(textField);
      expect(mockHandlePointerDown).toHaveBeenCalled();
    });

    it('deselects field when clicking overlay', () => {
      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={mockPositions}
          selectedField="name"
        />
      );

      const overlay = screen.getByAltText('Certificate Template').nextElementSibling;
      fireEvent.click(overlay!);
      
      expect(mockSetSelectedField).toHaveBeenCalledWith(null);
      expect(mockSetShowCenterGuide).toHaveBeenCalledWith({
        horizontal: false,
        vertical: false
      });
    });
  });

  describe('Alignment Indicators', () => {
    const mockTableData: TableData[] = [{ name: 'Test User' }];

    it('shows left alignment indicator when selected', () => {
      const positions: Positions = {
        name: { x: 50, y: 50, alignment: 'left' }
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={positions}
          selectedField="name"
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      const leftIndicators = textField?.querySelectorAll('[style*="left: -2px"]');
      expect(leftIndicators?.length).toBeGreaterThan(0);
    });

    it('shows center alignment indicator when selected', () => {
      const positions: Positions = {
        name: { x: 50, y: 50, alignment: 'center' }
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={positions}
          selectedField="name"
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      const centerIndicators = textField?.querySelectorAll('[style*="calc(50% - 6px)"]');
      expect(centerIndicators?.length).toBeGreaterThan(0);
    });

    it('shows right alignment indicator when selected', () => {
      const positions: Positions = {
        name: { x: 50, y: 50, alignment: 'right' }
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          tableData={mockTableData}
          positions={positions}
          selectedField="name"
        />
      );

      const textField = screen.getByText('Test User').closest('[data-key="name"]');
      const rightIndicators = textField?.querySelectorAll('[style*="right: -2px"]');
      expect(rightIndicators?.length).toBeGreaterThan(0);
    });
  });

  describe('Center Guides', () => {
    it('shows vertical center guide', () => {
      const showCenterGuide: CenterGuideState = {
        horizontal: false,
        vertical: true
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          showCenterGuide={showCenterGuide}
        />
      );

      const verticalGuide = document.querySelector('[style*="left: 50%"][style*="height: 100%"]');
      expect(verticalGuide).toHaveStyle({ opacity: '0.8' });
    });

    it('shows horizontal center guide', () => {
      const showCenterGuide: CenterGuideState = {
        horizontal: true,
        vertical: false
      };

      render(
        <CertificatePreview
          {...defaultProps}
          uploadedFileUrl="test.jpg"
          showCenterGuide={showCenterGuide}
        />
      );

      const horizontalGuide = document.querySelector('[style*="top: 50%"][style*="width: 100%"]');
      expect(horizontalGuide).toHaveStyle({ opacity: '0.8' });
    });
  });

  describe('File Upload', () => {
    it('handles file selection', async () => {
      render(<CertificatePreview {...defaultProps} />);
      
      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const input = screen.getByLabelText(/choose file/i).closest('input') as HTMLInputElement;
      
      await userEvent.upload(input, file);
      expect(mockHandleFileUpload).toHaveBeenCalled();
    });

    it('handles drag over event', () => {
      render(<CertificatePreview {...defaultProps} />);
      
      const dropZone = screen.getByText(/choose file/i).closest('div')!;
      fireEvent.dragOver(dropZone);
      
      expect(mockHandleDragOver).toHaveBeenCalled();
    });

    it('handles drop event', () => {
      render(<CertificatePreview {...defaultProps} />);
      
      const dropZone = screen.getByText(/choose file/i).closest('div')!;
      fireEvent.drop(dropZone);
      
      expect(mockHandleFileDrop).toHaveBeenCalled();
    });

    it('accepts only JPEG and PNG files', () => {
      render(<CertificatePreview {...defaultProps} />);
      
      const input = screen.getByLabelText(/choose file/i).closest('input');
      expect(input).toHaveAttribute('accept', 'image/jpeg,image/png');
    });
  });

  describe('Component Memoization', () => {
    it('does not re-render when unrelated props change', () => {
      const { rerender } = render(<CertificatePreview {...defaultProps} />);
      
      const initialRender = screen.getByText(/choose file/i);
      
      // Change a prop that should not trigger re-render
      rerender(<CertificatePreview {...defaultProps} />);
      
      expect(screen.getByText(/choose file/i)).toBe(initialRender);
    });

    it('re-renders when important props change', () => {
      const { rerender } = render(<CertificatePreview {...defaultProps} />);
      
      // Change uploadedFileUrl which should trigger re-render
      rerender(<CertificatePreview {...defaultProps} uploadedFileUrl="new-image.jpg" />);
      
      expect(screen.getByAltText('Certificate Template')).toBeInTheDocument();
    });
  });
});