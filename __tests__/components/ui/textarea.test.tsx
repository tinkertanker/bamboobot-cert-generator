import React from 'react';
import { render, screen } from '@testing-library/react';
import { Textarea } from '../../../components/ui/textarea';

describe('Textarea Component', () => {
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
});