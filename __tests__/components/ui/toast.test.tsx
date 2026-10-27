import React from 'react';
import { render, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast, ToastContainer, useToast } from '@/components/ui/toast';

function Harness({ duration }: { duration?: number }) {
  const { toasts, showToast, hideToast } = useToast();
  return <>
    <button onClick={() => showToast({ message: 'Saved', type: 'success', duration })}>Save</button>
    <ToastContainer toasts={toasts} onClose={hideToast} />
  </>;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('toast notifications', () => {
  it('announces errors urgently and other messages as status, with named dismiss controls', () => {
    render(<ToastContainer toasts={[
      { id: 'info', message: 'Preparing' },
      { id: 'success', message: 'Saved', type: 'success' },
      { id: 'error', message: 'Failed', type: 'error' },
    ]} onClose={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    expect(screen.getAllByRole('status').map(node => node.textContent)).toEqual(['Preparing', 'Saved']);
    expect(screen.getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(3);
  });

  it.each([undefined, 5000])('dismisses at the configured deadline (%s), not before it', async duration => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Harness duration={duration} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    act(() => jest.advanceTimersByTime((duration ?? 3000) - 1));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps persistent notifications until their dismiss button is used', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Harness duration={0} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    act(() => jest.advanceTimersByTime(10000));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('dismisses identical simultaneous notifications independently', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<Harness duration={0} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const notifications = screen.getAllByRole('status');
    expect(notifications).toHaveLength(2);
    await user.click(within(notifications[0]).getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(notifications[1]).toBeInTheDocument();
    await user.click(within(notifications[1]).getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not notify the owner after unmount', () => {
    const onClose = jest.fn();
    const { unmount } = render(<Toast id="one" message="Saved" onClose={onClose} />);
    unmount();
    act(() => jest.advanceTimersByTime(3000));
    expect(onClose).not.toHaveBeenCalled();
  });
});
