import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitButton, SplitButtonMenuItem } from '@/components/ui/split-button';
import { Download, Save } from 'lucide-react';

describe('SplitButton Component', () => {
  const defaultProps = {
    label: 'Main Action',
    onClick: jest.fn(),
    menuItems: [
      { label: 'Option 1', onClick: jest.fn() },
      { label: 'Option 2', onClick: jest.fn() },
    ] as SplitButtonMenuItem[],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders main button with label', () => {
      render(<SplitButton {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Main Action' })).toBeInTheDocument();
    });

    it('renders dropdown button with chevron', () => {
      render(<SplitButton {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[1]).toHaveAttribute('aria-haspopup', 'true');
      expect(buttons[1]).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders with primary variant by default', () => {
      render(<SplitButton {...defaultProps} />);
      const mainButton = screen.getByRole('button', { name: 'Main Action' });
      expect(mainButton).toHaveClass('bg-gradient-to-r', 'from-blue-600', 'to-blue-700');
    });

    it('renders with secondary variant', () => {
      render(<SplitButton {...defaultProps} variant="secondary" />);
      const mainButton = screen.getByRole('button', { name: 'Main Action' });
      expect(mainButton).toHaveClass('bg-white', 'border', 'border-gray-300');
    });

    it('applies custom className', () => {
      render(<SplitButton {...defaultProps} className="custom-class" />);
      const container = screen.getByRole('button', { name: 'Main Action' }).parentElement;
      expect(container).toHaveClass('custom-class');
    });

    it('applies custom gradient class', () => {
      render(<SplitButton {...defaultProps} gradientClass="bg-gradient-to-r from-green-500 to-green-600" />);
      const mainButton = screen.getByRole('button', { name: 'Main Action' });
      expect(mainButton).toHaveClass('bg-gradient-to-r', 'from-green-500', 'to-green-600');
    });
  });

  describe('Main Button Functionality', () => {
    it('calls onClick when main button is clicked', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      await user.click(screen.getByRole('button', { name: 'Main Action' }));
      expect(defaultProps.onClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} disabled />);
      
      await user.click(screen.getByRole('button', { name: 'Main Action' }));
      expect(defaultProps.onClick).not.toHaveBeenCalled();
    });

    it('applies disabled styles when disabled', () => {
      render(<SplitButton {...defaultProps} disabled />);
      const mainButton = screen.getByRole('button', { name: 'Main Action' });
      expect(mainButton).toBeDisabled();
      expect(mainButton).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });

  describe('Dropdown Functionality', () => {
    it('toggles dropdown menu when dropdown button is clicked', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      const dropdownButton = screen.getAllByRole('button')[1];
      
      // Initially closed
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      
      // Open dropdown
      await user.click(dropdownButton);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(dropdownButton).toHaveAttribute('aria-expanded', 'true');
      
      // Close dropdown
      await user.click(dropdownButton);
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
      expect(dropdownButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders all menu items when open', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      await user.click(screen.getAllByRole('button')[1]);
      
      expect(screen.getByRole('menuitem', { name: 'Option 1' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Option 2' })).toBeInTheDocument();
    });

    it('renders menu items with icons', async () => {
      const user = userEvent.setup();
      const menuItems = [
        { label: 'Download', onClick: jest.fn(), icon: <Download /> },
        { label: 'Save', onClick: jest.fn(), icon: <Save /> },
      ];
      
      render(<SplitButton {...defaultProps} menuItems={menuItems} />);
      await user.click(screen.getAllByRole('button')[1]);
      
      const downloadItem = screen.getByRole('menuitem', { name: 'Download' });
      expect(downloadItem.querySelector('svg')).toBeInTheDocument();
    });

    it('calls menu item onClick and closes dropdown when clicked', async () => {
      const user = userEvent.setup();
      const menuItem1Click = jest.fn();
      const menuItems = [
        { label: 'Option 1', onClick: menuItem1Click },
        { label: 'Option 2', onClick: jest.fn() },
      ];
      
      render(<SplitButton {...defaultProps} menuItems={menuItems} />);
      
      // Open dropdown
      await user.click(screen.getAllByRole('button')[1]);
      
      // Click menu item
      await user.click(screen.getByRole('menuitem', { name: 'Option 1' }));
      
      expect(menuItem1Click).toHaveBeenCalledTimes(1);
      
      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('handles disabled menu items', async () => {
      const user = userEvent.setup();
      const menuItemClick = jest.fn();
      const menuItems = [
        { label: 'Disabled Option', onClick: menuItemClick, disabled: true },
        { label: 'Enabled Option', onClick: jest.fn() },
      ];
      
      render(<SplitButton {...defaultProps} menuItems={menuItems} />);
      
      await user.click(screen.getAllByRole('button')[1]);
      
      const disabledItem = screen.getByRole('menuitem', { name: 'Disabled Option' });
      expect(disabledItem).toBeDisabled();
      expect(disabledItem).toHaveClass('text-gray-400', 'cursor-not-allowed');
      
      await user.click(disabledItem);
      expect(menuItemClick).not.toHaveBeenCalled();
      
      // Dropdown should stay open for disabled items
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('closes dropdown when clicking outside', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <SplitButton {...defaultProps} />
          <button>Outside Button</button>
        </div>
      );
      
      // Open dropdown
      await user.click(screen.getAllByRole('button')[1]);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      
      // Click outside
      await user.click(screen.getByRole('button', { name: 'Outside Button' }));
      
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('does not open dropdown when disabled', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} disabled />);
      
      const dropdownButton = screen.getAllByRole('button')[1];
      expect(dropdownButton).toBeDisabled();
      
      await user.click(dropdownButton);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('rotates chevron icon when dropdown is open', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      const dropdownButton = screen.getAllByRole('button')[1];
      const chevron = dropdownButton.querySelector('svg');
      
      expect(chevron).not.toHaveClass('rotate-180');
      
      await user.click(dropdownButton);
      expect(chevron).toHaveClass('rotate-180');
      
      await user.click(dropdownButton);
      await waitFor(() => {
        expect(chevron).not.toHaveClass('rotate-180');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('can be navigated with keyboard', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      // Tab to main button
      await user.tab();
      expect(screen.getByRole('button', { name: 'Main Action' })).toHaveFocus();
      
      // Tab to dropdown button
      await user.tab();
      expect(screen.getAllByRole('button')[1]).toHaveFocus();
      
      // Open dropdown with Enter
      await user.keyboard('{Enter}');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      
      // Close by clicking the dropdown button again (since Escape handling isn't implemented)
      await user.click(screen.getAllByRole('button')[1]);
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });
  });

  describe('Ref Forwarding', () => {
    it('forwards ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<SplitButton {...defaultProps} ref={ref} />);
      
      expect(ref.current).not.toBeNull();
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});