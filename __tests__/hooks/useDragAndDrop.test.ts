import { renderHook, act, waitFor } from '@testing-library/react';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import type { Positions, TabType } from '@/types/certificate';

// Mock useThrottle hook
jest.mock('@/hooks/useDebounce', () => ({
  useThrottle: (fn: Function) => fn
}));

describe('useDragAndDrop', () => {
  const mockSetPositions = jest.fn();
  const mockSetSelectedField = jest.fn();
  const mockSetActiveTab = jest.fn();
  
  const initialPositions: Positions = {
    field1: { x: 10, y: 20, alignment: 'left' },
    field2: { x: 50, y: 50, alignment: 'center' }
  };

  const defaultProps = {
    positions: initialPositions,
    setPositions: mockSetPositions,
    setSelectedField: mockSetSelectedField,
    setActiveTab: mockSetActiveTab
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock DOM elements
    document.body.innerHTML = `
      <div class="image-container" style="width: 100px; height: 100px; position: relative;">
        <div id="test-element" style="position: absolute; left: 10px; top: 20px; width: 50px; height: 20px;"></div>
      </div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Initial State', () => {
    it('initializes with correct default values', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      expect(result.current.isDragging).toBe(false);
      expect(result.current.dragInfo).toBeNull();
      expect(result.current.showCenterGuide).toEqual({
        horizontal: false,
        vertical: false
      });
    });
  });

  describe('handlePointerDown', () => {
    it('starts dragging and sets drag info', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const mockElement = document.getElementById('test-element') as HTMLElement;
      const mockEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        clientX: 35,
        clientY: 30,
        pointerId: 1
      } as unknown as React.PointerEvent;
      
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown(mockEvent, 'field1');
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockSetSelectedField).toHaveBeenCalledWith('field1');
      expect(mockSetActiveTab).toHaveBeenCalledWith('formatting');
      expect(result.current.isDragging).toBe(true);
      expect(result.current.dragInfo).toEqual({
        key: 'field1',
        offsetX: 25, // 35 - 10 (left aligned)
        offsetY: 0,  // 30 - 30 (vertical center)
        pointerId: 1
      });
      expect(mockElement.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('calculates offset based on alignment - center', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const mockElement = document.getElementById('test-element') as HTMLElement;
      const mockEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        clientX: 40,
        clientY: 30,
        pointerId: 1
      } as unknown as React.PointerEvent;
      
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown(mockEvent, 'field2');
      });

      expect(result.current.dragInfo?.offsetX).toBe(5); // 40 - 35 (center = left + width/2)
    });

    it('calculates offset based on alignment - right', () => {
      const positionsWithRight: Positions = {
        field3: { x: 90, y: 20, alignment: 'right' }
      };
      
      const { result } = renderHook(() => useDragAndDrop({
        ...defaultProps,
        positions: positionsWithRight
      }));
      
      const mockElement = document.getElementById('test-element') as HTMLElement;
      const mockEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        clientX: 55,
        clientY: 30,
        pointerId: 1
      } as unknown as React.PointerEvent;
      
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown(mockEvent, 'field3');
      });

      expect(result.current.dragInfo?.offsetX).toBe(-5); // 55 - 60 (right aligned)
    });
  });

  describe('handlePointerUp', () => {
    it('stops dragging and clears drag info', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      // First start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.releasePointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      const pointerDownEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        clientX: 35,
        clientY: 30,
        pointerId: 1
      } as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerDown(pointerDownEvent, 'field1');
      });

      expect(result.current.isDragging).toBe(true);

      // Then release
      const pointerUpEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        pointerId: 1
      } as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerUp(pointerUpEvent);
      });

      expect(pointerUpEvent.preventDefault).toHaveBeenCalled();
      expect(result.current.isDragging).toBe(false);
      expect(result.current.dragInfo).toBeNull();
      expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('ignores pointer up from different pointer', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      // Start dragging with pointer 1
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.releasePointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 35,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      // Try to release with pointer 2
      const pointerUpEvent = {
        preventDefault: jest.fn(),
        currentTarget: mockElement,
        pointerId: 2
      } as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerUp(pointerUpEvent);
      });

      expect(pointerUpEvent.preventDefault).not.toHaveBeenCalled();
      expect(result.current.isDragging).toBe(true);
      expect(mockElement.releasePointerCapture).not.toHaveBeenCalled();
    });
  });

  describe('Global pointer move handling', () => {
    it('updates position during drag', async () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const container = document.querySelector('.image-container') as HTMLElement;
      container.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100
      } as DOMRect));

      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 10,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      // Simulate global pointer move
      const moveEvent = new PointerEvent('pointermove', {
        clientX: 50,
        clientY: 60,
        pointerId: 1
      });

      act(() => {
        document.dispatchEvent(moveEvent);
      });

      await waitFor(() => {
        expect(mockSetPositions).toHaveBeenCalledWith(expect.any(Function));
      });

      // Verify the position update function
      const updateFn = mockSetPositions.mock.calls[0][0];
      const newPositions = updateFn(initialPositions);
      expect(newPositions.field1.x).toBe(50); // (50 - 0 - 0) / 100 * 100
      expect(newPositions.field1.y).toBe(30); // (60 - 30 - 0) / 100 * 100
    });

    it('clamps position to valid range', async () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const container = document.querySelector('.image-container') as HTMLElement;
      container.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100
      } as DOMRect));

      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 10,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      // Move to position that would be out of bounds
      const moveEvent = new PointerEvent('pointermove', {
        clientX: 150,
        clientY: -20,
        pointerId: 1
      });

      act(() => {
        document.dispatchEvent(moveEvent);
      });

      await waitFor(() => {
        expect(mockSetPositions).toHaveBeenCalled();
      });

      const updateFn = mockSetPositions.mock.calls[0][0];
      const newPositions = updateFn(initialPositions);
      expect(newPositions.field1.x).toBe(100); // Clamped to max
      expect(newPositions.field1.y).toBe(0); // Clamped to min
    });

    it('resets to center when dragged too far out of bounds', async () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const container = document.querySelector('.image-container') as HTMLElement;
      container.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100
      } as DOMRect));

      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 10,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      // Move way out of bounds (beyond threshold)
      const moveEvent = new PointerEvent('pointermove', {
        clientX: -50,
        clientY: 30,
        pointerId: 1
      });

      act(() => {
        document.dispatchEvent(moveEvent);
      });

      await waitFor(() => {
        expect(mockSetPositions).toHaveBeenCalled();
      });

      const updateFn = mockSetPositions.mock.calls[0][0];
      const newPositions = updateFn(initialPositions);
      expect(newPositions.field1.x).toBe(50); // Reset to center
      expect(newPositions.field1.y).toBe(50); // Reset to center
    });

    it('snaps to center and shows guides', async () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      const container = document.querySelector('.image-container') as HTMLElement;
      container.getBoundingClientRect = jest.fn(() => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100
      } as DOMRect));

      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 10,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      // Move close to center (within snap threshold)
      const moveEvent = new PointerEvent('pointermove', {
        clientX: 51,
        clientY: 49,
        pointerId: 1
      });

      act(() => {
        document.dispatchEvent(moveEvent);
      });

      await waitFor(() => {
        expect(mockSetPositions).toHaveBeenCalled();
      });

      const updateFn = mockSetPositions.mock.calls[0][0];
      const newPositions = updateFn(initialPositions);
      expect(newPositions.field1.x).toBe(50); // Snapped to center
      expect(newPositions.field1.y).toBe(50); // Snapped to center

      expect(result.current.showCenterGuide).toEqual({
        horizontal: true,
        vertical: true
      });
    });
  });

  describe('clearDragState', () => {
    it('resets all drag-related state', () => {
      const { result } = renderHook(() => useDragAndDrop(defaultProps));
      
      // Set up some drag state
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 35,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      expect(result.current.isDragging).toBe(true);
      expect(result.current.dragInfo).not.toBeNull();

      // Clear drag state
      act(() => {
        result.current.clearDragState();
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.dragInfo).toBeNull();
      expect(result.current.showCenterGuide).toEqual({
        horizontal: false,
        vertical: false
      });
    });
  });

  describe('Cleanup', () => {
    it('removes event listeners when dragging stops', () => {
      const { result, unmount } = renderHook(() => useDragAndDrop(defaultProps));
      
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 35,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));

      // Simulate global pointer up
      const upEvent = new PointerEvent('pointerup', { pointerId: 1 });
      act(() => {
        document.dispatchEvent(upEvent);
      });

      // Wait for state update and cleanup
      waitFor(() => {
        expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
        expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
        expect(removeEventListenerSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      });

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    it('cleans up on unmount', () => {
      const { result, unmount } = renderHook(() => useDragAndDrop(defaultProps));
      
      // Start dragging
      const mockElement = document.getElementById('test-element') as HTMLElement;
      mockElement.setPointerCapture = jest.fn();
      mockElement.getBoundingClientRect = jest.fn(() => ({
        left: 10,
        top: 20,
        right: 60,
        bottom: 40,
        width: 50,
        height: 20
      } as DOMRect));

      act(() => {
        result.current.handlePointerDown({
          preventDefault: jest.fn(),
          currentTarget: mockElement,
          clientX: 35,
          clientY: 30,
          pointerId: 1
        } as unknown as React.PointerEvent, 'field1');
      });

      expect(result.current.isDragging).toBe(true);

      // Unmount while dragging
      unmount();

      // State should be cleaned up (though we can't check it after unmount)
      // This mainly tests that no errors occur during cleanup
    });
  });
});