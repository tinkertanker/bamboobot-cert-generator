import React from 'react';
import { render, screen } from '@testing-library/react';
import { Textarea } from '../../../components/ui/textarea';

describe('Textarea Component', () => {
  it('renders with default styling', () => {
    render(<Textarea placeholder="Enter text" />);
    const textarea = screen.getByPlaceholderText('Enter text');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveClass('min-h-[80px]');
    expect(textarea).toHaveClass('rounded-md');
    expect(textarea).toHaveClass('border-input');
  });

  it('accepts and applies custom className', () => {
    render(<Textarea className="custom-class" placeholder="Custom textarea" />);
    const textarea = screen.getByPlaceholderText('Custom textarea');
    expect(textarea).toHaveClass('custom-class');
    expect(textarea).toHaveClass('min-h-[80px]'); // Still has the default class
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} defaultValue="Test content" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.value).toBe('Test content');
  });

  it('applies disabled styles when disabled', () => {
    render(<Textarea disabled placeholder="Disabled textarea" />);
    const textarea = screen.getByPlaceholderText('Disabled textarea');
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveClass('disabled:opacity-50');
  });

  it('passes HTML attributes to the textarea element', () => {
    render(
      <Textarea
        rows={5}
        cols={40}
        maxLength={100}
        name="test-name"
        id="test-id"
        placeholder="With attributes"
      />
    );
    const textarea = screen.getByPlaceholderText('With attributes');
    expect(textarea).toHaveAttribute('rows', '5');
    expect(textarea).toHaveAttribute('cols', '40');
    expect(textarea).toHaveAttribute('maxLength', '100');
    expect(textarea).toHaveAttribute('name', 'test-name');
    expect(textarea).toHaveAttribute('id', 'test-id');
  });
});