import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualizedTable } from '@/components/VirtualizedTable';
import type { Row, Cell } from 'react-table';
import type { TableData } from '@/types/certificate';

// Mock react-window
jest.mock('react-window', () => ({
  FixedSizeList: ({ children, height, itemCount, itemSize }: any) => {
    return (
      <div data-testid="virtual-list" style={{ height }}>
        {Array.from({ length: itemCount }).map((_, index) => (
          <div key={index} style={{ height: itemSize }}>
            {children({ index, style: { height: itemSize } })}
          </div>
        ))}
      </div>
    );
  }
}));

// Mock COLORS
jest.mock('@/utils/styles', () => ({
  COLORS: {
    highlightBg: 'rgb(255, 243, 224)',
    borderGray: '#d1d5db'
  }
}));

describe('VirtualizedTable', () => {
  const mockSetCurrentPreviewIndex = jest.fn();
  const mockPrepareRow = jest.fn();

  // Create mock row data
  const createMockRow = (data: TableData, index: number): Row<TableData> => ({
    id: `row-${index}`,
    index,
    values: data,
    cells: Object.entries(data).map(([key, value]) => ({
      column: { id: key },
      value,
      render: () => value,
      getCellProps: () => ({})
    } as unknown as Cell<TableData>)),
    getRowProps: () => ({}),
    original: data,
    subRows: [],
    state: {},
    depth: 0,
    path: [],
    canExpand: false,
    toggleRowExpanded: () => {},
    isExpanded: false,
    toggleRowSelected: () => {},
    isSelected: false,
    getToggleRowSelectedProps: () => ({})
  } as unknown as Row<TableData>);

  const mockRows: Row<TableData>[] = [
    createMockRow({ name: 'John Doe', email: 'john@example.com' }, 0),
    createMockRow({ name: 'Jane Smith', email: 'jane@example.com' }, 1),
    createMockRow({ name: 'Bob Johnson', email: 'bob@example.com' }, 2)
  ];

  const defaultProps = {
    rows: mockRows,
    prepareRow: mockPrepareRow,
    currentPreviewIndex: 0,
    setCurrentPreviewIndex: mockSetCurrentPreviewIndex,
    height: 400
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders virtual list with correct height', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const virtualList = screen.getByTestId('virtual-list');
      expect(virtualList).toHaveStyle({ height: '400px' });
    });

    it('renders all rows', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
      expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    });

    it('calls prepareRow for each row', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      expect(mockPrepareRow).toHaveBeenCalledTimes(mockRows.length);
      mockRows.forEach(row => {
        expect(mockPrepareRow).toHaveBeenCalledWith(row);
      });
    });
  });

  describe('Row Styling', () => {
    it('highlights current row', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={1} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).toHaveStyle({
        backgroundColor: 'rgb(255, 243, 224)' // COLORS.highlightBg
      });
    });

    it('shows transparent background for non-current rows', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={0} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).toHaveStyle({
        backgroundColor: 'transparent'
      });
    });

    it('applies hover class to non-current rows', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={0} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).toHaveClass('hover:bg-gray-50');
    });

    it('does not apply hover class to current row', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={1} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).not.toHaveClass('hover:bg-gray-50');
    });
  });

  describe('Cell Rendering', () => {
    it('renders cells with correct styling', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const nameCell = screen.getByText('John Doe');
      expect(nameCell).toHaveClass('px-4', 'py-2', 'text-sm');
    });

    it('applies special styling to current row cells', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={0} />);
      
      const currentRowCell = screen.getByText('John Doe');
      expect(currentRowCell).toHaveClass('text-amber-900', 'font-medium');
    });

    it('applies normal styling to non-current row cells', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={0} />);
      
      const nonCurrentRowCell = screen.getByText('Jane Smith');
      expect(nonCurrentRowCell).toHaveClass('text-gray-900');
    });

    it('distributes cell width evenly', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const cells = screen.getAllByText(/john@example.com|jane@example.com/);
      cells.forEach(cell => {
        expect(cell).toHaveStyle({
          flex: '0 0 50%' // 100% / 2 cells
        });
      });
    });
  });

  describe('Interaction', () => {
    it('handles row click', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      fireEvent.click(janeRow!);
      
      expect(mockSetCurrentPreviewIndex).toHaveBeenCalledWith(1);
    });

    it('shows correct title for current row', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={1} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).toHaveAttribute('title', 'Currently viewing this entry');
    });

    it('shows correct title for non-current rows', () => {
      render(<VirtualizedTable {...defaultProps} currentPreviewIndex={0} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      expect(janeRow).toHaveAttribute('title', 'Click to view this entry');
    });
  });

  describe('Filtering Support', () => {
    it('handles originalRows for filtered data', () => {
      const filteredRows = [mockRows[0], mockRows[2]]; // Only John and Bob
      
      render(
        <VirtualizedTable
          {...defaultProps}
          rows={filteredRows}
          originalRows={mockRows}
          currentPreviewIndex={2} // Bob's original index
        />
      );
      
      // Bob should be highlighted even though he's at index 1 in filtered rows
      const bobRow = screen.getByText('Bob Johnson').closest('div[style*="display: flex"]');
      expect(bobRow).toHaveStyle({
        backgroundColor: 'rgb(255, 243, 224)'
      });
    });

    it('uses correct original index when clicking filtered row', () => {
      const filteredRows = [mockRows[0], mockRows[2]]; // Only John and Bob
      
      render(
        <VirtualizedTable
          {...defaultProps}
          rows={filteredRows}
          originalRows={mockRows}
        />
      );
      
      const bobRow = screen.getByText('Bob Johnson').closest('div[style*="display: flex"]');
      fireEvent.click(bobRow!);
      
      // Should use Bob's original index (2) not his filtered index (1)
      expect(mockSetCurrentPreviewIndex).toHaveBeenCalledWith(2);
    });

    it('falls back to regular index when originalRows not provided', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      fireEvent.click(janeRow!);
      
      expect(mockSetCurrentPreviewIndex).toHaveBeenCalledWith(1);
    });
  });

  describe('Performance', () => {
    it('uses React.useCallback for Row component', () => {
      const { rerender } = render(<VirtualizedTable {...defaultProps} />);
      
      // Get initial render
      const initialJohn = screen.getByText('John Doe');
      
      // Rerender with same props
      rerender(<VirtualizedTable {...defaultProps} />);
      
      // Should still be the same element (not recreated)
      expect(screen.getByText('John Doe')).toBe(initialJohn);
    });

    it('renders with fixed row height', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const rows = screen.getAllByText(/John Doe|Jane Smith|Bob Johnson/).map(
        el => el.closest('div[style*="height"]')
      );
      
      rows.forEach(row => {
        if (row) {
          expect(row).toHaveStyle({ height: '41px' });
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles empty rows array', () => {
      render(<VirtualizedTable {...defaultProps} rows={[]} />);
      
      const virtualList = screen.getByTestId('virtual-list');
      expect(virtualList).toBeInTheDocument();
      expect(virtualList.children).toHaveLength(0);
    });

    it('handles rows with different number of cells', () => {
      const unevenRows = [
        createMockRow({ name: 'John Doe' }, 0),
        createMockRow({ name: 'Jane Smith', email: 'jane@example.com', phone: '123-456' }, 1)
      ];
      
      render(<VirtualizedTable {...defaultProps} rows={unevenRows} />);
      
      // Find the row containers
      const johnRow = screen.getByText('John Doe').closest('div[style*="display: flex"]');
      const janeRow = screen.getByText('Jane Smith').closest('div[style*="display: flex"]');
      
      // Count cells by checking direct children
      const johnCells = johnRow?.querySelectorAll('div.px-4.py-2');
      const janeCells = janeRow?.querySelectorAll('div.px-4.py-2');
      
      expect(johnCells).toHaveLength(1);
      expect(janeCells).toHaveLength(3);
    });

    it('handles text overflow with ellipsis', () => {
      render(<VirtualizedTable {...defaultProps} />);
      
      const cell = screen.getByText('John Doe');
      expect(cell).toHaveStyle({
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      });
    });
  });
});