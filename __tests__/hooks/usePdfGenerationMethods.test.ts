import { act, renderHook } from '@testing-library/react';
import { usePdfGenerationMethods } from '@/hooks/usePdfGenerationMethods';
import type { CapacityDecision } from '@/lib/pdf/client/individual-capacity';

const capacity = (allowed: boolean): CapacityDecision => ({
  allowed,
  estimatedRetainedBytes: 1,
  estimatedPeakBytes: allowed ? 1 : 2,
  budgetBytes: 1,
  retainedBudgetBytes: 1,
  reason: allowed ? 'ok' : 'memory-limit'
});

const createProps = (rowCount: number) => ({
  isDevelopment: false,
  devMode: false,
  isClientSupported: true,
  tableData: Array.from({ length: rowCount }, (_, index) => ({
    Name: `Person ${index}`
  })),
  localBlobUrl: null,
  uploadedFileUrl: '/template.pdf',
  uploadedFile: 'template.pdf',
  generatePdf: jest.fn().mockResolvedValue(undefined),
  generateIndividualPdfs: jest.fn().mockResolvedValue(undefined),
  startProgressiveGeneration: jest.fn().mockResolvedValue(undefined),
  setGeneratedPdfUrl: jest.fn(),
  setIndividualPdfsData: jest.fn(),
  generateClientPdf: jest.fn().mockResolvedValue(undefined),
  generateClientIndividualPdfs: jest.fn().mockResolvedValue(undefined),
  assessClientIndividualCapacity: jest.fn(),
  clientGeneratedPdfUrl: null,
  clientIndividualPdfsData: null,
  uploadToServer: jest.fn().mockResolvedValue(undefined)
});

describe('usePdfGenerationMethods individual capacity routing', () => {
  it('uses client generation when capacity allows it', async () => {
    const props = createProps(20);
    props.assessClientIndividualCapacity.mockResolvedValue(capacity(true));
    const { result } = renderHook(() => usePdfGenerationMethods(props));

    await act(() => result.current.handleGenerateIndividualPdfs());

    expect(props.generateClientIndividualPdfs).toHaveBeenCalledTimes(1);
    expect(props.generateIndividualPdfs).not.toHaveBeenCalled();
  });

  it('falls back to normal server generation when a small job exceeds capacity', async () => {
    const props = createProps(20);
    props.assessClientIndividualCapacity.mockResolvedValue(capacity(false));
    const { result } = renderHook(() => usePdfGenerationMethods(props));

    await act(() => result.current.handleGenerateIndividualPdfs());

    expect(props.generateIndividualPdfs).toHaveBeenCalledWith('template.pdf');
    expect(props.generateClientIndividualPdfs).not.toHaveBeenCalled();
  });

  it('falls back to progressive server generation for a large denied job', async () => {
    const props = createProps(101);
    props.assessClientIndividualCapacity.mockResolvedValue(capacity(false));
    const { result } = renderHook(() => usePdfGenerationMethods(props));

    await act(() => result.current.handleGenerateIndividualPdfs());

    expect(props.startProgressiveGeneration).toHaveBeenCalledWith(
      'individual',
      20,
      'template.pdf'
    );
    expect(props.generateClientIndividualPdfs).not.toHaveBeenCalled();
  });

  it('fails closed to server generation when assessment throws', async () => {
    const props = createProps(20);
    props.assessClientIndividualCapacity.mockRejectedValue(
      new Error('memory API failed')
    );
    const { result } = renderHook(() => usePdfGenerationMethods(props));

    await act(() => result.current.handleGenerateIndividualPdfs());

    expect(props.generateIndividualPdfs).toHaveBeenCalledWith('template.pdf');
  });
});
