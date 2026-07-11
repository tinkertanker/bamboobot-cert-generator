import { areCertificatePreviewPropsEqual } from '@/components/CertificatePreview';
import type { CertificatePreviewProps } from '@/types/certificate';

const createProps = (): CertificatePreviewProps => {
  const row = { name: 'Ada' };
  return {
    uploadedFileUrl: '/certificate.png',
    isLoading: false,
    tableData: [row, { name: 'Grace' }],
    currentPreviewIndex: 0,
    positions: { name: { x: 50, y: 50, fontSize: 20 } },
    selectedField: 'name',
    setSelectedField: jest.fn(),
    isDragging: false,
    dragInfo: null,
    showCenterGuide: { horizontal: false, vertical: false },
    handlePointerDown: jest.fn(),
    handlePointerUp: jest.fn(),
    setShowCenterGuide: jest.fn(),
    isDraggingFile: false,
    handleDragOver: jest.fn(),
    handleDragLeave: jest.fn(),
    handleFileDrop: jest.fn(),
    handleFileUpload: jest.fn()
  };
};

describe('CertificatePreview memo comparison', () => {
  it('uses immutable references instead of serializing positions and rows', () => {
    const previous = createProps();
    const next = { ...previous, tableData: [...previous.tableData] };

    expect(areCertificatePreviewPropsEqual(previous, next)).toBe(true);
    expect(
      areCertificatePreviewPropsEqual(previous, {
        ...next,
        positions: { ...previous.positions }
      })
    ).toBe(false);
    expect(
      areCertificatePreviewPropsEqual(previous, {
        ...next,
        tableData: [{ ...previous.tableData[0] }, previous.tableData[1]]
      })
    ).toBe(false);
  });

  it('ignores changes to rows outside the active preview', () => {
    const previous = createProps();
    const next = {
      ...previous,
      tableData: [previous.tableData[0], { name: 'Katherine' }]
    };

    expect(areCertificatePreviewPropsEqual(previous, next)).toBe(true);
  });

  it('compares drag state and the rendered fallback row', () => {
    const previous = createProps();
    const dragging = {
      ...previous,
      isDragging: true,
      dragInfo: { key: 'name', offsetX: 0, offsetY: 0, pointerId: 1 }
    };

    expect(
      areCertificatePreviewPropsEqual(dragging, {
        ...dragging,
        dragInfo: { ...dragging.dragInfo, key: 'title' }
      })
    ).toBe(false);

    const outOfRange = { ...previous, currentPreviewIndex: 10 };
    expect(
      areCertificatePreviewPropsEqual(outOfRange, {
        ...outOfRange,
        tableData: [{ name: 'Changed' }, previous.tableData[1]]
      })
    ).toBe(false);
  });
});
