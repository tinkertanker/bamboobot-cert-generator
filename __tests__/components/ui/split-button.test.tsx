import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitButton, SplitButtonMenuItem } from '@/components/ui/split-button';

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
  });

  describe('Dropdown Functionality', () => {
    it('toggles dropdown menu when dropdown button is clicked', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} />);
      
      const dropdownButton = screen.getByRole('button', { name: 'More Main Action options' });
      expect(dropdownButton).toHaveAttribute('aria-haspopup', 'menu');
      expect(dropdownButton).toHaveAttribute('aria-expanded', 'false');
      
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
  });

  describe('Keyboard Navigation', () => {
    it('opens with Enter, skips disabled items and separators, wraps, and restores focus on Escape', async () => {
      const user = userEvent.setup();
      render(<SplitButton {...defaultProps} menuItems={[
        { label: 'Disabled', onClick: jest.fn(), disabled: true },
        { label: 'First', onClick: jest.fn() },
        { label: '', onClick: jest.fn(), separator: true },
        { label: 'Middle disabled', onClick: jest.fn(), disabled: true },
        { label: 'Last', onClick: jest.fn() },
      ]} />);
      await user.tab();
      expect(screen.getByRole('button', { name: 'Main Action' })).toHaveFocus();
      await user.tab();
      const toggle = screen.getByRole('button', { name: 'More Main Action options' });
      expect(toggle).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('menu', { name: 'More Main Action options' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
      await user.keyboard('{Home}');
      expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
      await user.keyboard('{End}');
      expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(toggle).toHaveFocus();
    });

    it('does not leak menu navigation to certificate keyboard shortcuts', async () => {
      const user = userEvent.setup();
      const onKeyDown = jest.fn();
      render(<div onKeyDown={onKeyDown}><SplitButton {...defaultProps} /></div>);
      await user.click(screen.getByRole('button', { name: 'More Main Action options' }));
      screen.getByRole('menuitem', { name: 'Option 1' }).focus();
      await user.keyboard('{ArrowDown}{ArrowUp}{Home}{End}{Escape}');
      expect(onKeyDown).not.toHaveBeenCalled();
    });
  });
});
