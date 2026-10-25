import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Positions } from '@/types/certificate';

function setup(initial: Positions, platform = 'Win32') {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  let positions = initial;
  const setPositions = jest.fn((update: Positions | ((prev: Positions) => Positions)) => {
    positions = typeof update === 'function' ? update(positions) : update;
  });
  renderHook(() =>
    useKeyboardShortcuts({
      selectedField: 'Name',
      isDragging: false,
      positions: initial,
      setPositions,
      onEscapePressed: jest.fn()
    })
  );
  return { setPositions, get: () => positions };
}

describe('useKeyboardShortcuts format shortcuts', () => {
  it('toggles bold with Ctrl+B on Windows but ignores Cmd+B there', () => {
    const { get } = setup({ Name: { x: 50, y: 50, fontFamily: 'Helvetica' } });
    act(() => {
      fireEvent.keyDown(document, { key: 'b', metaKey: true });
    });
    expect(get().Name.bold).toBeUndefined();
    act(() => {
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    });
    expect(get().Name.bold).toBe(true);
  });

  it('toggles italic with Cmd+I on macOS', () => {
    const { get } = setup({ Name: { x: 50, y: 50, fontFamily: 'Helvetica' } }, 'MacIntel');
    act(() => {
      fireEvent.keyDown(document, { key: 'i', metaKey: true });
    });
    expect(get().Name.italic).toBe(true);
  });

  it('respects font capabilities', () => {
    const { setPositions } = setup({ Name: { x: 50, y: 50, fontFamily: 'GreatVibes' } });
    act(() => {
      fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
      fireEvent.keyDown(document, { key: 'i', ctrlKey: true });
    });
    expect(setPositions).not.toHaveBeenCalled();
  });

  it('does not trigger on other key combinations', () => {
    const { setPositions } = setup({ Name: { x: 50, y: 50, fontFamily: 'Helvetica' } });
    act(() => {
      fireEvent.keyDown(document, { key: 'x', ctrlKey: true });
    });
    expect(setPositions).not.toHaveBeenCalled();
  });
});
