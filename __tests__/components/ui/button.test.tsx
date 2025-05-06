import React from 'react';
import { render, screen } from '@testing-library/react';
import { Button } from '../../../components/ui/button';

describe('Button Component', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-primary');
    expect(button).toHaveClass('h-10 px-4 py-2');
  });

  it('renders with destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button).toHaveClass('bg-destructive');
  });

  it('renders with outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button', { name: /outline/i });
    expect(button).toHaveClass('border border-input bg-background');
  });

  it('renders with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button', { name: /secondary/i });
    expect(button).toHaveClass('bg-secondary');
  });

  it('renders with ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button', { name: /ghost/i });
    expect(button).toHaveClass('hover:bg-accent');
  });

  it('renders with link variant', () => {
    render(<Button variant="link">Link</Button>);
    const button = screen.getByRole('button', { name: /link/i });
    expect(button).toHaveClass('text-primary');
    expect(button).toHaveClass('hover:underline');
  });

  it('supports different sizes', () => {
    render(<Button size="sm">Small</Button>);
    const smallButton = screen.getByRole('button', { name: /small/i });
    expect(smallButton).toHaveClass('h-9');
    
    render(<Button size="lg">Large</Button>);
    const largeButton = screen.getByRole('button', { name: /large/i });
    expect(largeButton).toHaveClass('h-11');
    
    render(<Button size="icon">Icon</Button>);
    const iconButton = screen.getByRole('button', { name: /icon/i });
    expect(iconButton).toHaveClass('h-10 w-10');
  });

  it('applies custom class names', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button', { name: /custom/i });
    expect(button).toHaveClass('custom-class');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref Test</Button>);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.textContent).toBe('Ref Test');
  });

  it('renders as a child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="#">Link Button</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '#');
    expect(link).toHaveClass('bg-primary');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button', { name: /disabled/i });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
  });
});