import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTemplateModal } from '@/components/modals/NewTemplateModal';

describe('NewTemplateModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    hasUnsavedWork: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      expect(screen.getByText('Start New Project?')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<NewTemplateModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByText('Start New Project?')).not.toBeInTheDocument();
    });

    it('renders warning icon', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      // Find the container with the warning icon
      const contentContainer = screen.getByText('Start New Project?').closest('.flex');
      const icon = contentContainer?.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('text-amber-500');
    });

    it('renders correct message when hasUnsavedWork is true', () => {
      render(<NewTemplateModal {...defaultProps} hasUnsavedWork={true} />);
      
      expect(screen.getByText(/Your current work has been autosaved/)).toBeInTheDocument();
      expect(screen.getByText(/will remain accessible via Load Projects/)).toBeInTheDocument();
    });

    it('renders correct message when hasUnsavedWork is false', () => {
      render(<NewTemplateModal {...defaultProps} hasUnsavedWork={false} />);
      
      expect(screen.getByText(/This will clear all current settings and start fresh/)).toBeInTheDocument();
    });

    it('renders both action buttons', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start New' })).toBeInTheDocument();
    });
  });

  describe('Button Functionality', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<NewTemplateModal {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
    });

    it('calls both onConfirm and onClose when Start New button is clicked', async () => {
      const user = userEvent.setup();
      render(<NewTemplateModal {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: 'Start New' }));
      
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm before onClose when confirming', async () => {
      const user = userEvent.setup();
      const callOrder: string[] = [];
      
      const onConfirm = jest.fn(() => callOrder.push('confirm'));
      const onClose = jest.fn(() => callOrder.push('close'));
      
      render(<NewTemplateModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} />);
      
      await user.click(screen.getByRole('button', { name: 'Start New' }));
      
      expect(callOrder).toEqual(['confirm', 'close']);
    });
  });

  describe('Modal Behavior', () => {
    it('uses Modal component with correct props', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      // Check for Modal's characteristic classes
      const modalBackdrop = document.querySelector('.fixed.inset-0.bg-black');
      expect(modalBackdrop).toBeInTheDocument();
    });

    it('sets correct width on modal', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      const modalContent = screen.getByText('Start New Project?').closest('.w-96');
      expect(modalContent).toHaveClass('w-96');
    });
  });

  describe('Keyboard Navigation', () => {
    it('can navigate with keyboard', async () => {
      const user = userEvent.setup();
      render(<NewTemplateModal {...defaultProps} />);
      
      // Tab to first button (Cancel)
      await user.tab();
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
      
      // Tab to second button (Start New)
      await user.tab();
      expect(screen.getByRole('button', { name: 'Start New' })).toHaveFocus();
    });

    it('handles Enter key on focused button', async () => {
      const user = userEvent.setup();
      render(<NewTemplateModal {...defaultProps} />);
      
      // Tab to Cancel button and press Enter
      await user.tab();
      await user.keyboard('{Enter}');
      
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Button Styling', () => {
    it('applies correct styles to Cancel button', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelButton).toHaveClass('border', 'border-input', 'bg-background');
    });

    it('applies correct styles to Start New button', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      const startButton = screen.getByRole('button', { name: 'Start New' });
      expect(startButton).toHaveClass('bg-blue-600', 'hover:bg-blue-700', 'text-white');
    });
  });

  describe('Content Layout', () => {
    it('uses correct spacing classes', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      const contentWrapper = screen.getByText('Start New Project?').closest('.space-y-4');
      expect(contentWrapper).toHaveClass('space-y-4');
      
      const iconWrapper = screen.getByText('Start New Project?').closest('.flex');
      expect(iconWrapper).toHaveClass('flex', 'items-start', 'gap-3');
    });

    it('positions buttons correctly', () => {
      render(<NewTemplateModal {...defaultProps} />);
      
      const buttonWrapper = screen.getByRole('button', { name: 'Cancel' }).parentElement;
      expect(buttonWrapper).toHaveClass('flex', 'gap-3', 'justify-end');
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid clicks without errors', async () => {
      const user = userEvent.setup();
      render(<NewTemplateModal {...defaultProps} />);
      
      const startButton = screen.getByRole('button', { name: 'Start New' });
      
      // Simulate rapid clicks
      await user.click(startButton);
      await user.click(startButton);
      await user.click(startButton);
      
      // Should still only call each function once per actual click
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(3);
      expect(defaultProps.onClose).toHaveBeenCalledTimes(3);
    });

    it('updates correctly when props change', () => {
      const { rerender } = render(<NewTemplateModal {...defaultProps} hasUnsavedWork={false} />);
      
      expect(screen.getByText(/This will clear all current settings/)).toBeInTheDocument();
      
      rerender(<NewTemplateModal {...defaultProps} hasUnsavedWork={true} />);
      
      expect(screen.queryByText(/This will clear all current settings/)).not.toBeInTheDocument();
      expect(screen.getByText(/Your current work has been autosaved/)).toBeInTheDocument();
    });
  });
});
