import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ERROR_MESSAGES } from '@/utils/errorMessages';

// Mock fetch globally
global.fetch = jest.fn();

describe('useFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useFileUpload());

    expect(result.current.uploadedFile).toBeNull();
    expect(result.current.uploadedFileUrl).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isDraggingFile).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  describe('processFile', () => {
    it('should process valid image file successfully', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'test.pdf',
          image: '/temp_images/test.jpg',
          isTemplate: false,
          storageType: 'local'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadedFile).toBe('test.pdf');
      expect(result.current.uploadedFileUrl).toBe('/temp_images/test.jpg');
      expect(result.current.uploadError).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith('/api/upload', {
        method: 'POST',
        body: expect.any(FormData)
      });
    });

    it('should process template file with isTemplate parameter', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'template.pdf',
          image: '/template_images/template.jpg',
          isTemplate: true,
          storageType: 'r2'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'template.png', { type: 'image/png' });

      // Create a spy to check FormData
      const formDataAppendSpy = jest.spyOn(FormData.prototype, 'append');

      await act(async () => {
        await result.current.processFile(file, true);
      });

      expect(formDataAppendSpy).toHaveBeenCalledWith('template', file);
      expect(formDataAppendSpy).toHaveBeenCalledWith('isTemplate', 'true');
      expect(result.current.uploadedFile).toBe('template.pdf');
      expect(result.current.uploadedFileUrl).toBe('/template_images/template.jpg');

      formDataAppendSpy.mockRestore();
    });

    it('should reject invalid file types', async () => {
      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.INVALID_FILE_TYPE);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject files larger than 10MB', async () => {
      const { result } = renderHook(() => useFileUpload());
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.FILE_TOO_LARGE);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle upload errors', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Internal Server Error'
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.UPLOAD_FAILED);
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).toEqual(ERROR_MESSAGES.UPLOAD_FAILED);
    });

    it('should set loading state during upload', async () => {
      let resolvePromise: (value: any) => void;
      const uploadPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      (global.fetch as jest.Mock).mockReturnValue(uploadPromise);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

      // Start upload
      const uploadAct = act(async () => {
        await result.current.processFile(file);
      });

      // Check loading state
      expect(result.current.isLoading).toBe(true);

      // Resolve upload
      act(() => {
        resolvePromise!({
          ok: true,
          json: jest.fn().mockResolvedValue({
            filename: 'test.pdf',
            image: '/temp_images/test.jpg'
          })
        });
      });

      await uploadAct;

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('handleFileUpload', () => {
    it('should process file from input change event', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'test.pdf',
          image: '/temp_images/test.jpg'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as any;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(result.current.uploadedFile).toBe('test.pdf');
    });

    it('should handle empty file input', async () => {
      const { result } = renderHook(() => useFileUpload());
      const event = { target: { files: [] } } as any;

      await act(async () => {
        await result.current.handleFileUpload(event);
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('drag and drop handlers', () => {
    it('should handle drag over', () => {
      const { result } = renderHook(() => useFileUpload());
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      } as any;

      act(() => {
        result.current.handleDragOver(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(result.current.isDraggingFile).toBe(true);
    });

    it('should handle drag leave', () => {
      const { result } = renderHook(() => useFileUpload());
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      } as any;

      // First set dragging to true
      act(() => {
        result.current.handleDragOver(event);
      });

      // Then handle drag leave
      act(() => {
        result.current.handleDragLeave(event);
      });

      expect(result.current.isDraggingFile).toBe(false);
    });

    it('should handle file drop', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          filename: 'test.pdf',
          image: '/temp_images/test.jpg'
        })
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const event = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: { files: [file] }
      } as any;

      await act(async () => {
        await result.current.handleFileDrop(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(result.current.isDraggingFile).toBe(false);
      expect(result.current.uploadedFile).toBe('test.pdf');
    });
  });

  describe('utility functions', () => {
    it('should clear file', () => {
      const { result } = renderHook(() => useFileUpload());

      // Set some values first
      act(() => {
        result.current.setUploadedFile('test.pdf');
        result.current.setUploadedFileUrl('/temp_images/test.jpg');
      });

      expect(result.current.uploadedFile).toBe('test.pdf');
      expect(result.current.uploadedFileUrl).toBe('/temp_images/test.jpg');

      // Clear file
      act(() => {
        result.current.clearFile();
      });

      expect(result.current.uploadedFile).toBeNull();
      expect(result.current.uploadedFileUrl).toBeNull();
    });

    it('should clear error', async () => {
      const { result } = renderHook(() => useFileUpload());
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });

      // Generate an error
      await act(async () => {
        await result.current.processFile(file);
      });

      expect(result.current.uploadError).not.toBeNull();

      // Clear error
      act(() => {
        result.current.clearError();
      });

      expect(result.current.uploadError).toBeNull();
    });
  });
});