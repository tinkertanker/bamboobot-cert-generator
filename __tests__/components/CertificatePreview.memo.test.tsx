import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CertificatePreview } from '@/components/CertificatePreview';
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

describe('CertificatePreview updates', () => {
  it('shows updated text and formatting, then switches to the selected entry', () => {
    const props = createProps();
    const { rerender } = render(<CertificatePreview {...props} />);
    const field = () => screen.getByRole('button', { name: /^name text field/ });
    expect(field()).toHaveTextContent('Ada');

    const updatedText = {
      ...props,
      tableData: [{ name: 'Katherine' }, props.tableData[1]]
    };
    rerender(<CertificatePreview {...updatedText} />);
    expect(field()).toHaveTextContent('Katherine');

    const updated = {
      ...updatedText,
      positions: { name: { x: 23, y: 61, color: '#123456', bold: true } }
    };
    rerender(<CertificatePreview {...updated} />);
    expect(field()).toHaveStyle({ left: '23%', top: '61%', color: '#123456', fontWeight: 'bold' });

    rerender(<CertificatePreview {...updated} currentPreviewIndex={1} />);
    expect(field()).toHaveTextContent('Grace');
    expect(field()).toHaveAttribute('aria-pressed', 'true');

    rerender(<CertificatePreview {...updated} currentPreviewIndex={1} selectedField={null} />);
    expect(field()).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the active entry visible when another row changes and falls back for an invalid index', () => {
    const props = createProps();
    const { rerender } = render(<CertificatePreview {...props} />);
    rerender(<CertificatePreview {...props} tableData={[props.tableData[0], { name: 'Katherine' }]} />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.queryByText('Katherine')).not.toBeInTheDocument();

    rerender(<CertificatePreview {...props} currentPreviewIndex={10} />);
    rerender(<CertificatePreview {...props} currentPreviewIndex={10}
      tableData={[{ name: 'Changed' }, props.tableData[1]]} />);
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
  });

  it('uses the latest field-selection callback after rerendering', () => {
    const props = createProps();
    const { rerender } = render(<CertificatePreview {...props} />);
    const setSelectedField = jest.fn();
    rerender(<CertificatePreview {...props} setSelectedField={setSelectedField} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^name text field/ }), { key: 'Enter' });
    expect(setSelectedField).toHaveBeenCalledWith('name');
    expect(props.setSelectedField).not.toHaveBeenCalled();
  });

  it('moves drag feedback to the currently dragged field', () => {
    const props = {
      ...createProps(),
      tableData: [{ name: 'Ada', course: 'Maths' }],
      isDragging: true,
      dragInfo: { key: 'name', offsetX: 0, offsetY: 0, pointerId: 1 }
    };
    const { rerender } = render(<CertificatePreview {...props} />);
    const name = screen.getByRole('button', { name: /^name text field/ });
    const course = screen.getByRole('button', { name: /^course text field/ });
    expect(name).toHaveStyle({ cursor: 'grabbing' });
    expect(course).toHaveStyle({ cursor: 'grab' });

    rerender(<CertificatePreview {...props} dragInfo={{ ...props.dragInfo, key: 'course' }} />);
    expect(name).toHaveStyle({ cursor: 'grab' });
    expect(course).toHaveStyle({ cursor: 'grabbing' });
  });
});
