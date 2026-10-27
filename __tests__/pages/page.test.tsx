import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MainPage from '../../pages/app';
import { useSession } from 'next-auth/react';

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

// Mock the OnboardingModal component
jest.mock('../../components/modals/OnboardingModal', () => ({
  OnboardingModal: ({ isOpen, onClose, onStartTour, onSkip }: any) => {
    if (!isOpen) return null;
    return (
      <div data-testid="onboarding-modal">
        <button onClick={onStartTour}>Start Tour</button>
        <button onClick={onSkip}>Skip</button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

// Mock the useOnboarding hook
jest.mock('../../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    showOnboarding: false,
    hasSeenOnboarding: true,
    startTour: jest.fn(),
    skipOnboarding: jest.fn(),
    setShowOnboarding: jest.fn(),
  }),
}));

// Mock driver.js
jest.mock('driver.js', () => ({
  driver: jest.fn(() => ({
    drive: jest.fn(),
    destroy: jest.fn(),
    isActivated: false,
  })),
}));

describe('MainPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not mount storage-backed editor features when quarantine fails', () => {
    localStorage.clear();
    localStorage.setItem('bamboobot_current_session_v1', 'private recipient data');
    (useSession as jest.Mock).mockReturnValue({ status: 'authenticated', data: { user: { id: 'new-user' } } });
    const original = Storage.prototype.setItem;
    const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('bamboobot_quarantine_')) throw new Error('QuotaExceededError');
      return original.call(this, key, value);
    });
    try {
      render(<MainPage />);
      expect(screen.getByRole('alert')).toHaveTextContent('Browser data could not be safely separated');
      expect(screen.queryByRole('textbox', { name: 'Certificate data' })).not.toBeInTheDocument();
      expect(localStorage.getItem('bamboobot_current_session_v1')).toBe('private recipient data');
    } finally {
      write.mockRestore();
      (useSession as jest.Mock).mockReturnValue({ status: 'unauthenticated' });
      localStorage.clear();
    }
  });

  it('renders the upload button when no file is uploaded', () => {
    render(<MainPage />);
    expect(screen.getByText(/Upload your certificate's background image here/i)).toBeInTheDocument();
    expect(screen.getByText(/Bamboobot/i)).toBeInTheDocument();
  });

  it('handles file upload', async () => {
    render(<MainPage />);
    
    // A real PNG: invalid image bytes must no longer use the old PDF fallback.
    const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64'));
    const file = new File([bytes], 'test.png', { type: 'image/png' });
    file.arrayBuffer = async () => bytes.buffer;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    
    // Fire upload event
    Object.defineProperty(fileInput, 'files', {
      value: [file],
    });
    fireEvent.change(fileInput);
    
    // With client-side generation, files are kept as blob URLs locally
    // No immediate upload to server should happen
    await waitFor(() => {
      // The file should be processed locally, creating a blob URL
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      // No server upload should occur immediately
      expect(global.fetch).not.toHaveBeenCalledWith(
        '/api/upload',
        expect.anything()
      );
    });
  });

  it('renders data table when tabular data is entered', async () => {
    render(<MainPage />);
    
    // Simulate entering tabular data
    const textarea = screen.getByPlaceholderText(/Paste the text you want to show on the certs here/i);
    fireEvent.change(textarea, {
      target: { value: 'Name\tRole\nJohn Doe\tDeveloper\nJane Smith\tDesigner' },
    });
    
    // Wait for the table to be rendered
    await waitFor(() => {
      const tables = screen.getAllByRole('table');
      expect(tables).toHaveLength(1); // Single table with sticky header for small datasets
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Designer')).toBeInTheDocument();
    });
  });

  it('toggles header row treatment', async () => {
    render(<MainPage />);
    
    // Enter data
    const textarea = screen.getByPlaceholderText(/Paste the text you want to show on the certs here/i);
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
    const generateButton = screen.getByRole('button', { name: /^Generate$/i });
    expect(generateButton).toBeDisabled();
  });
});
