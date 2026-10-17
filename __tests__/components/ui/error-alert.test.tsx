import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorModal } from '@/components/ui/error-alert';

describe('ErrorModal', () => {
  it('is an accessible dialog that focuses the primary action and closes on Escape', () => {
    const onClose = jest.fn();
    const onRetry = jest.fn();
    render(
      <ErrorModal open title="Upload failed" message="Something went wrong" onClose={onClose} onRetry={onRetry} />
    );

    const dialog = screen.getByRole('dialog', { name: 'Upload failed' });
    expect(dialog).toHaveAccessibleDescription(/Something went wrong/);
    expect(screen.getByRole('button', { name: 'Try Again' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<ErrorModal open={false} title="Hidden" message="x" onClose={jest.fn()} />);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
