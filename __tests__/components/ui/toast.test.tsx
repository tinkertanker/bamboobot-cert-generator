import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast, ToastContainer, useToast } from '@/components/ui/toast';

// Mock timers
jest.useFakeTimers();

describe('Toast Component', () => {
  const defaultProps = {
    id: 'test-toast',
    message: 'Test message',
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with default info type', () => {
      render(<Toast {...defaultProps} />);
      
      const toast = screen.getByText('Test message').closest('div');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveClass('bg-blue-50', 'text-blue-800', 'border-blue-200');
    });

    it('renders with success type', () => {
      render(<Toast {...defaultProps} type="success" />);
      
      const toast = screen.getByText('Test message').closest('div');
      expect(toast).toHaveClass('bg-green-50', 'text-green-800', 'border-green-200');
      // Check for SVG icon presence
      const icon = toast?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders with error type', () => {
      render(<Toast {...defaultProps} type="error" />);
      
      const toast = screen.getByText('Test message').closest('div');
      expect(toast).toHaveClass('bg-red-50', 'text-red-800', 'border-red-200');
      // Check for SVG icon presence
      const icon = toast?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<Toast {...defaultProps} />);
      
      const closeButton = screen.getByRole('button');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton.querySelector('svg')).toBeInTheDocument(); // X icon
    });

    it('applies animation class', () => {
      render(<Toast {...defaultProps} />);
      
      const toast = screen.getByText('Test message').closest('div');
      expect(toast).toHaveClass('animate-slide-in');
    });
  });

  describe('Auto-dismiss', () => {
    it('auto-dismisses after default duration (3000ms)', () => {
      render(<Toast {...defaultProps} />);
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      
      expect(defaultProps.onClose).toHaveBeenCalledWith('test-toast');
    });

    it('auto-dismisses after custom duration', () => {
      render(<Toast {...defaultProps} duration={5000} />);
      
      act(() => {
        jest.advanceTimersByTime(4999);
      });
      expect(defaultProps.onClose).not.toHaveBeenCalled();
      
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(defaultProps.onClose).toHaveBeenCalledWith('test-toast');
    });

    it('does not auto-dismiss when duration is 0', () => {
      render(<Toast {...defaultProps} duration={0} />);
      
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it('clears timeout on unmount', () => {
      const { unmount } = render(<Toast {...defaultProps} />);
      
      unmount();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Manual dismiss', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Toast {...defaultProps} />);
      
      await user.click(screen.getByRole('button'));
      
      expect(defaultProps.onClose).toHaveBeenCalledWith('test-toast');
    });

    it('does not auto-dismiss after manual close', async () => {
      const user = userEvent.setup({ delay: null });
      const { unmount } = render(<Toast {...defaultProps} />);
      
      await user.click(screen.getByRole('button'));
      
      // Component would typically be removed from DOM after close
      // So we unmount to simulate this behavior
      unmount();
      
      jest.clearAllMocks();
      
      act(() => {
        jest.advanceTimersByTime(3000);
      });
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('Ref forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Toast {...defaultProps} ref={ref} />);
      
      expect(ref.current).not.toBeNull();
      expect(ref.current?.textContent).toContain('Test message');
    });
  });
});

describe('ToastContainer Component', () => {
  const mockToasts = [
    { id: '1', message: 'Toast 1', type: 'success' as const },
    { id: '2', message: 'Toast 2', type: 'error' as const },
    { id: '3', message: 'Toast 3', type: 'info' as const },
  ];

  it('renders all toasts', () => {
    render(<ToastContainer toasts={mockToasts} onClose={jest.fn()} />);
    
    expect(screen.getByText('Toast 1')).toBeInTheDocument();
    expect(screen.getByText('Toast 2')).toBeInTheDocument();
    expect(screen.getByText('Toast 3')).toBeInTheDocument();
  });

  it('positions container correctly', () => {
    render(<ToastContainer toasts={mockToasts} onClose={jest.fn()} />);
    
    const container = screen.getByText('Toast 1').closest('.fixed');
    expect(container).toHaveClass('fixed', 'bottom-4', 'right-4', 'z-50');
  });

  it('stacks toasts vertically', () => {
    render(<ToastContainer toasts={mockToasts} onClose={jest.fn()} />);
    
    const container = screen.getByText('Toast 1').closest('.fixed');
    expect(container).toHaveClass('flex', 'flex-col', 'gap-2');
  });

  it('makes toasts interactive while container is not', () => {
    render(<ToastContainer toasts={mockToasts} onClose={jest.fn()} />);
    
    const container = screen.getByText('Toast 1').closest('.fixed');
    expect(container).toHaveClass('pointer-events-none');
    
    const toastWrapper = screen.getByText('Toast 1').closest('.pointer-events-auto');
    expect(toastWrapper).toHaveClass('pointer-events-auto');
  });

  it('passes onClose to each toast', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = jest.fn();
    render(<ToastContainer toasts={mockToasts} onClose={onClose} />);
    
    const closeButtons = screen.getAllByRole('button');
    await user.click(closeButtons[0]);
    
    expect(onClose).toHaveBeenCalledWith('1');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<ToastContainer toasts={mockToasts} onClose={jest.fn()} ref={ref} />);
    
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveClass('fixed', 'bottom-4', 'right-4');
  });
});

describe('useToast Hook', () => {
  function TestComponent() {
    const { toasts, showToast, hideToast } = useToast();
    
    return (
      <div>
        <button onClick={() => showToast({ message: 'Test toast', type: 'success' })}>
          Show Toast
        </button>
        <button onClick={() => showToast({ message: 'Error toast', type: 'error' })}>
          Show Error
        </button>
        <button onClick={() => toasts[0] && hideToast(toasts[0].id)}>
          Hide First
        </button>
        <ToastContainer toasts={toasts} onClose={hideToast} />
      </div>
    );
  }

  it('initializes with empty toasts', () => {
    render(<TestComponent />);
    
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('shows toast when showToast is called', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    
    expect(screen.getByText('Test toast')).toBeInTheDocument();
  });

  it('shows multiple toasts', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    await user.click(screen.getByText('Show Error'));
    
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    expect(screen.getByText('Error toast')).toBeInTheDocument();
  });

  it('generates unique IDs for toasts', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    await user.click(screen.getByText('Show Toast'));
    
    const toasts = screen.getAllByText('Test toast');
    expect(toasts).toHaveLength(2);
  });

  it('hides toast when hideToast is called', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    
    await user.click(screen.getByText('Hide First'));
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('auto-dismisses toasts', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    
    await waitFor(() => {
      expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
    });
  });

  it('handles manual dismiss via close button', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    
    const closeButton = screen.getAllByRole('button').find(btn => 
      btn.querySelector('svg') && btn.closest('[class*="bg-green"]')
    );
    
    await user.click(closeButton!);
    expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
  });

  it('preserves toast properties', async () => {
    const user = userEvent.setup({ delay: null });
    render(<TestComponent />);
    
    await user.click(screen.getByText('Show Toast'));
    
    const successToast = screen.getByText('Test toast').closest('div');
    expect(successToast).toHaveClass('bg-green-50', 'text-green-800');
    
    await user.click(screen.getByText('Show Error'));
    
    const errorToast = screen.getByText('Error toast').closest('div');
    expect(errorToast).toHaveClass('bg-red-50', 'text-red-800');
  });
});