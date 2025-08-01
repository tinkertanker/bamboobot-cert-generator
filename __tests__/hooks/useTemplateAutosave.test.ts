import { renderHook, act, waitFor } from '@testing-library/react';
import { useTemplateAutosave } from '@/hooks/useTemplateAutosave';
import { TemplateStorage } from '@/lib/template-storage';
import type { Positions, EmailConfig } from '@/types/certificate';

// Mock TemplateStorage
jest.mock('@/lib/template-storage', () => ({
  TemplateStorage: {
    saveTemplate: jest.fn(),
    updateTemplate: jest.fn(),
  },
}));

// Mock timers
jest.useFakeTimers();

describe('useTemplateAutosave', () => {
  const mockPositions: Positions = {
    name: { x: 100, y: 200 },
    date: { x: 300, y: 400 },
  };
  
  const mockColumns = ['name', 'date'];
  
  const mockTableData = [
    { name: 'John Doe', date: '2025-07-27' },
    { name: 'Jane Smith', date: '2025-07-28' }
  ];
  
  const mockEmailConfig: EmailConfig = {
    subject: 'Test Certificate',
    body: 'Your certificate is attached',
    fromEmail: 'sender@example.com',
    fromName: 'Test Sender',
  };

  const defaultProps = {
    positions: mockPositions,
    columns: mockColumns,
    tableData: mockTableData,
    emailConfig: mockEmailConfig,
    certificateImageUrl: '/test-image.jpg',
    certificateFilename: 'test-cert.pdf',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (TemplateStorage.saveTemplate as jest.Mock).mockResolvedValue({
      success: true,
      id: 'test-template-id',
    });
    (TemplateStorage.updateTemplate as jest.Mock).mockResolvedValue({
      success: true,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Session Name Generation', () => {
    it('generates a unique session name on initialization', () => {
      const { result } = renderHook(() => useTemplateAutosave(defaultProps));
      
      expect(result.current.sessionName).toMatch(/^Session \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    });

    it('maintains the same session name throughout the hook lifecycle', () => {
      const { result, rerender } = renderHook(() => useTemplateAutosave(defaultProps));
      
      const initialSessionName = result.current.sessionName;
      
      // Rerender with updated props
      rerender();
      
      expect(result.current.sessionName).toBe(initialSessionName);
    });
  });

  describe('Initial State', () => {
    it('initializes with correct default values', () => {
      const { result } = renderHook(() => useTemplateAutosave(defaultProps));
      
      expect(result.current.lastAutosaved).toBeNull();
      expect(result.current.isAutosaving).toBe(false);
      expect(typeof result.current.manualSave).toBe('function');
    });
  });

  describe('Autosave Functionality', () => {
    it('triggers autosave after 10 seconds when props change and template exists', async () => {
      const onAutosave = jest.fn();
      const { result, rerender } = renderHook(
        (props) => useTemplateAutosave(props),
        { initialProps: { 
          ...defaultProps, 
          onAutosave,
          currentTemplateId: 'existing-template-id',
          currentTemplateName: 'Existing Template'
        } }
      );

      // Change positions
      const newPositions = { ...mockPositions, name: { x: 150, y: 250 } };
      rerender({ 
        ...defaultProps, 
        positions: newPositions, 
        onAutosave,
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });

      // Should not save immediately
      expect(TemplateStorage.saveTemplate).not.toHaveBeenCalled();

      // Fast forward 10 seconds and wait for async operations
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve(); // Let microtasks run
      });

      await waitFor(() => {
        expect(TemplateStorage.updateTemplate).toHaveBeenCalledWith(
          'existing-template-id',
          {
            positions: newPositions,
            columns: mockColumns,
            tableData: mockTableData,
            emailConfig: mockEmailConfig,
            certificateImage: {
              url: '/test-image.jpg',
              filename: 'test-cert.pdf',
              uploadedAt: expect.any(String),
              isCloudStorage: false,
            }
          }
        );
      });

      expect(onAutosave).toHaveBeenCalledWith('existing-template-id');
      expect(result.current.lastAutosaved).toBeInstanceOf(Date);
    });

    it('debounces autosave when multiple changes occur rapidly', async () => {
      const { rerender } = renderHook(
        (props) => useTemplateAutosave(props),
        { initialProps: defaultProps }
      );

      // Make rapid changes
      rerender({ 
        ...defaultProps, 
        positions: { ...mockPositions, name: { x: 110, y: 210 } },
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      rerender({ 
        ...defaultProps, 
        positions: { ...mockPositions, name: { x: 120, y: 220 } },
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      rerender({ 
        ...defaultProps, 
        positions: { ...mockPositions, name: { x: 130, y: 230 } },
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });

      // Should not have saved yet
      expect(TemplateStorage.updateTemplate).not.toHaveBeenCalled();

      // Fast forward to complete the debounce (need full 10000ms from last change)
      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      await waitFor(() => {
        // Should only save once with the latest values
        expect(TemplateStorage.updateTemplate).toHaveBeenCalledTimes(1);
        expect(TemplateStorage.updateTemplate).toHaveBeenCalledWith(
          'existing-template-id',
          {
            positions: { ...mockPositions, name: { x: 130, y: 230 } },
            columns: mockColumns,
            tableData: mockTableData,
            emailConfig: mockEmailConfig,
            certificateImage: {
              url: '/test-image.jpg',
              filename: 'test-cert.pdf',
              uploadedAt: expect.any(String),
              isCloudStorage: false,
            }
          }
        );
      });
    });

    it('does not autosave when no certificate is loaded', () => {
      const { rerender } = renderHook(
        (props) => useTemplateAutosave(props),
        { 
          initialProps: {
            ...defaultProps,
            certificateImageUrl: null,
            certificateFilename: null,
          }
        }
      );

      // Change positions
      rerender({
        ...defaultProps,
        certificateImageUrl: null,
        certificateFilename: null,
        positions: { ...mockPositions, name: { x: 150, y: 250 } },
      });

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(TemplateStorage.saveTemplate).not.toHaveBeenCalled();
    });

    it('does not autosave when data has not changed', async () => {
      const { result, rerender } = renderHook(
        (props) => useTemplateAutosave(props),
        { initialProps: defaultProps }
      );

      // First trigger an autosave to establish baseline
      const newPositions = { ...mockPositions, name: { x: 150, y: 250 } };
      rerender({ ...defaultProps, positions: newPositions });

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // Clear mock to check for subsequent calls
      jest.clearAllMocks();

      // Rerender with same data
      rerender({ ...defaultProps, positions: newPositions });

      await act(async () => {
        jest.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      // Should not save again since data hasn't changed
      expect(TemplateStorage.saveTemplate).not.toHaveBeenCalled();
    });

    it('sets isAutosaving during save operation', async () => {
      let resolveSave: (value: any) => void;
      const savePromise = new Promise((resolve) => {
        resolveSave = resolve;
      });
      
      (TemplateStorage.updateTemplate as jest.Mock).mockReturnValue(savePromise);

      const { result, rerender } = renderHook(() => useTemplateAutosave({
        ...defaultProps,
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      }));

      // Trigger autosave
      rerender({ 
        ...defaultProps, 
        positions: { ...mockPositions, name: { x: 150, y: 250 } },
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.isAutosaving).toBe(true);
      });

      // Resolve save
      await act(async () => {
        resolveSave!({ success: true });
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(result.current.isAutosaving).toBe(false);
      });
    });

    it('handles autosave errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (TemplateStorage.updateTemplate as jest.Mock).mockRejectedValue(new Error('Save failed'));

      const { result, rerender } = renderHook(() => useTemplateAutosave({
        ...defaultProps,
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      }));

      // Trigger autosave
      rerender({ 
        ...defaultProps, 
        positions: { ...mockPositions, name: { x: 150, y: 250 } },
        currentTemplateId: 'existing-template-id',
        currentTemplateName: 'Existing Template'
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Autosave failed:', expect.any(Error));
      });

      expect(result.current.isAutosaving).toBe(false);
      expect(result.current.lastAutosaved).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Manual Save', () => {
    it('saves template with custom name', async () => {
      const { result } = renderHook(() => useTemplateAutosave(defaultProps));

      let saveResult;
      await act(async () => {
        saveResult = await result.current.manualSave('My Custom Template');
      });

      expect(TemplateStorage.saveTemplate).toHaveBeenCalledWith(
        'My Custom Template',
        mockPositions,
        mockColumns,
        '/test-image.jpg',
        'test-cert.pdf',
        mockTableData,
        mockEmailConfig,
        undefined
      );

      expect(saveResult).toEqual({ success: true, id: 'test-template-id' });
      expect(result.current.lastAutosaved).toBeInstanceOf(Date);
    });

    it('returns error when no certificate is loaded', async () => {
      const { result } = renderHook(() => useTemplateAutosave({
        ...defaultProps,
        certificateImageUrl: null,
        certificateFilename: null,
      }));

      let saveResult;
      await act(async () => {
        saveResult = await result.current.manualSave('My Template');
      });

      expect(saveResult).toEqual({ success: false, error: 'No certificate to save' });
      expect(TemplateStorage.saveTemplate).not.toHaveBeenCalled();
    });

    it('handles save errors', async () => {
      (TemplateStorage.saveTemplate as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Storage error',
      });

      const { result } = renderHook(() => useTemplateAutosave(defaultProps));

      let saveResult;
      await act(async () => {
        saveResult = await result.current.manualSave('My Template');
      });

      expect(saveResult).toEqual({ success: false, error: 'Storage error' });
    });

  });

  describe('Email Config Handling', () => {
    it('saves without email config when null', async () => {
      const { result } = renderHook(() => useTemplateAutosave({
        ...defaultProps,
        emailConfig: null,
      }));

      await act(async () => {
        await result.current.manualSave('No Email Template');
      });

      expect(TemplateStorage.saveTemplate).toHaveBeenCalledWith(
        'No Email Template',
        mockPositions,
        mockColumns,
        '/test-image.jpg',
        'test-cert.pdf',
        mockTableData,
        undefined,
        undefined
      );
    });
  });

  describe('Cleanup', () => {
    it('clears timeout on unmount', () => {
      const { unmount, rerender } = renderHook(() => useTemplateAutosave(defaultProps));

      // Trigger a change to start the timeout
      rerender({ ...defaultProps, positions: { ...mockPositions, name: { x: 150, y: 250 } } });

      // Unmount before timeout completes
      unmount();

      // Fast forward
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should not have called saveTemplate
      expect(TemplateStorage.saveTemplate).not.toHaveBeenCalled();
    });
  });
});