import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal, ModalTitle } from '@/components/ui/modal';

describe('Modal', () => {
  it('exposes dialog semantics labelled by its title', () => {
    render(
      <Modal open onClose={jest.fn()}>
        <ModalTitle>Delete project</ModalTitle>
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('falls back to the first heading for its accessible name', () => {
    render(
      <Modal open onClose={jest.fn()}>
        <h2>Projects</h2>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Projects' })).toBeInTheDocument();
  });

  it('closes on Escape and backdrop click, but not on clicks inside', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal open onClose={onClose}>
        <button>Inside</button>
      </Modal>
    );
    fireEvent.click(screen.getByText('Inside'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.firstChild as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('respects closeOnEscape and closeOnBackdropClick', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal open onClose={onClose} closeOnEscape={false} closeOnBackdropClick={false}>
        <p>Busy</p>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('only closes the top-most modal on Escape', () => {
    const outerClose = jest.fn();
    const innerClose = jest.fn();
    render(
      <Modal open onClose={outerClose}>
        <Modal open onClose={innerClose}>
          <p>Inner</p>
        </Modal>
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores focus on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)}>
            <button onClick={() => setOpen(false)}>Done</button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByText('Open');
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByText('Done'));
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
