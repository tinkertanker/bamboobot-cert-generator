import { act, renderHook, waitFor } from '@testing-library/react';
import { useClientPdfGeneration } from '@/hooks/useClientPdfGeneration';
import { ClientPdfGenerator } from '@/lib/pdf/client/pdf-generator-client';
import { FeatureDetector } from '@/lib/pdf/client/feature-detection';

describe('useClientPdfGeneration streamed individual files', () => {
  const generate = jest.fn();
  const destroy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(FeatureDetector, 'getInstance').mockReturnValue({
      checkCapabilities: jest.fn().mockResolvedValue({ overallSupport: true }),
      getMemoryInfo: jest.fn().mockResolvedValue({ available: false })
    } as unknown as FeatureDetector);
    jest.spyOn(ClientPdfGenerator, 'getInstance').mockReturnValue({
      generate,
      destroy
    } as unknown as ClientPdfGenerator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retains one Blob per streamed file and revokes URLs on clear', async () => {
    generate.mockImplementation(async (options) => {
      options.onFile({
        filename: 'second.pdf',
        originalIndex: 1,
        data: new Uint8Array([2])
      });
      options.onFile({
        filename: 'first.pdf',
        originalIndex: 0,
        data: new Uint8Array([1])
      });
      return { success: true, mode: 'individual' };
    });
    const createObjectURL = URL.createObjectURL as jest.Mock;
    createObjectURL
      .mockReturnValueOnce('blob:second')
      .mockReturnValueOnce('blob:first');
    const { result } = renderHook(() =>
      useClientPdfGeneration({
        tableData: [{ Name: 'First' }, { Name: 'Second' }],
        positions: { Name: { x: 50, y: 50, isVisible: false } },
        uploadedFile: new File(['template'], 'template.png', {
          type: 'image/png'
        }),
        localBlobUrl: 'blob:template',
        localPdfByteLength: 1024,
        selectedNamingColumn: 'Name',
        setSelectedNamingColumn: jest.fn()
      })
    );

    await waitFor(() => expect(result.current.isClientSupported).toBe(true));
    await act(() => result.current.generateIndividualPdfs());

    expect(result.current.individualPdfsData?.map((file) => file.filename)).toEqual([
      'first.pdf',
      'second.pdf'
    ]);
    expect(result.current.individualPdfsData?.every((file) => file.blob)).toBe(
      true
    );
    expect(
      result.current.individualPdfsData?.every(
        (file) => Object.keys(file).includes('blob') && !Object.keys(file).includes('data')
      )
    ).toBe(true);

    act(() => result.current.clearPdfData());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second');
  });

  it('revokes partial URLs when streaming fails', async () => {
    generate.mockImplementation(async (options) => {
      options.onFile({
        filename: 'partial.pdf',
        originalIndex: 0,
        data: new Uint8Array([1])
      });
      return {
        success: false,
        mode: 'individual',
        error: new Error('worker failed')
      };
    });
    (URL.createObjectURL as jest.Mock).mockReturnValueOnce('blob:partial');
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);
    const { result } = renderHook(() =>
      useClientPdfGeneration({
        tableData: [{ Name: 'First' }],
        positions: { Name: { x: 50, y: 50, isVisible: false } },
        uploadedFile: new File(['template'], 'template.png', {
          type: 'image/png'
        }),
        localBlobUrl: 'blob:template',
        selectedNamingColumn: 'Name',
        setSelectedNamingColumn: jest.fn()
      })
    );

    await waitFor(() => expect(result.current.isClientSupported).toBe(true));
    await act(() => result.current.generateIndividualPdfs());

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:partial');
    expect(result.current.individualPdfsData).toBeNull();
  });

  it('does not publish late files after the generation is cleared', async () => {
    let finishGeneration: ((value: { success: true; mode: 'individual' }) => void) | undefined;
    generate.mockImplementation((options) => {
      options.onFile({
        filename: 'late.pdf',
        originalIndex: 0,
        data: new Uint8Array([1])
      });
      return new Promise((resolve) => {
        finishGeneration = resolve;
      });
    });
    (URL.createObjectURL as jest.Mock).mockReturnValueOnce('blob:late');
    const { result } = renderHook(() =>
      useClientPdfGeneration({
        tableData: [{ Name: 'Late' }],
        positions: { Name: { x: 50, y: 50, isVisible: false } },
        uploadedFile: new File(['template'], 'template.png', {
          type: 'image/png'
        }),
        localBlobUrl: 'blob:template',
        selectedNamingColumn: 'Name',
        setSelectedNamingColumn: jest.fn()
      })
    );

    await waitFor(() => expect(result.current.isClientSupported).toBe(true));
    let generationPromise: Promise<void>;
    act(() => {
      generationPromise = result.current.generateIndividualPdfs();
    });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    act(() => result.current.clearPdfData());
    finishGeneration?.({ success: true, mode: 'individual' });
    await act(() => generationPromise!);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
    expect(result.current.individualPdfsData).toBeNull();
  });
});
