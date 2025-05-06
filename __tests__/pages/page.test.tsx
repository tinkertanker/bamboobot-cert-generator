import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MainPage from '../../app/page';

// Mock the fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({
      message: 'Template uploaded successfully',
      filename: 'test.pdf',
      image: '/temp_images/test.jpg',
    }),
  })
) as jest.Mock;

// Mock the Next/Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    return <img {...props} alt={props.alt || 'Mock Image'} />;
  },
}));

// Mock file-saver
jest.mock('file-saver', () => ({
  saveAs: jest.fn(),
}));

describe('MainPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the upload button when no file is uploaded', () => {
    render(<MainPage />);
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument();
    expect(screen.getByText(/Cert Generator Again/i)).toBeInTheDocument();
  });

  it('handles file upload', async () => {
    render(<MainPage />);
    
    // Mock file upload
    const file = new File(['dummy content'], 'test.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText(/Choose File/i);
    
    // Fire upload event
    Object.defineProperty(fileInput, 'files', {
      value: [file],
    });
    fireEvent.change(fileInput);
    
    // Check if fetch was called with the right arguments
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      );
    });
  });

  it('renders data table when tabular data is entered', async () => {
    render(<MainPage />);
    
    // Simulate entering tabular data
    const textarea = screen.getByPlaceholderText(/Paste tabular data here/i);
    fireEvent.change(textarea, {
      target: { value: 'Name\tRole\nJohn Doe\tDeveloper\nJane Smith\tDesigner' },
    });
    
    // Wait for the table to be rendered
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Designer')).toBeInTheDocument();
    });
  });

  it('toggles header row treatment', async () => {
    render(<MainPage />);
    
    // Enter data
    const textarea = screen.getByPlaceholderText(/Paste tabular data here/i);
    fireEvent.change(textarea, {
      target: { value: 'Header1\tHeader2\nValue1\tValue2' },
    });
    
    // By default, first row should be treated as headers
    await waitFor(() => {
      expect(screen.getByText('Header1')).toBeInTheDocument();
    });
    
    // Toggle the header checkbox off
    const headerToggle = screen.getByLabelText(/Treat first row as header/i);
    fireEvent.click(headerToggle);
    
    // Now we should see both rows as data with Column headers
    await waitFor(() => {
      const headerCells = screen.getAllByRole('columnheader');
      expect(headerCells.length).toBeGreaterThan(0);
      expect(screen.getByText('Header1')).toBeInTheDocument(); // Now as a data cell
      expect(screen.getByText('Value1')).toBeInTheDocument();
    });
  });

  it('disables generate button when no file is uploaded', () => {
    render(<MainPage />);
    const generateButton = screen.getByText(/Generate PDF/i);
    expect(generateButton).toBeDisabled();
  });
});