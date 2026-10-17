import React, { useMemo } from "react";
import { FixedSizeList as List, areEqual } from "react-window";
import type { ListChildComponentProps } from "react-window";
import { COLORS } from "@/utils/styles";
import type { TableData } from "@/types/certificate";
import type { Row, Cell } from "react-table";

interface VirtualizedTableProps {
  rows: Row<TableData>[];
  prepareRow: (row: Row<TableData>) => void;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number) => void;
  height: number;
  /** Maps a (possibly filtered) row back to its index in the full dataset */
  getOriginalIndex?: (row: Row<TableData>) => number;
}

interface RowData {
  rows: Row<TableData>[];
  prepareRow: (row: Row<TableData>) => void;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number) => void;
  getOriginalIndex?: (row: Row<TableData>) => number;
}

const ROW_HEIGHT = 41; // Height of each row in pixels (py-2 + border)

// Defined at module level (not recreated per render) so react-window keeps the
// same component type and only re-renders rows instead of remounting them.
const VirtualizedRow = React.memo(function VirtualizedRow({
  index,
  style,
  data
}: ListChildComponentProps<RowData>) {
  const { rows, prepareRow, currentPreviewIndex, setCurrentPreviewIndex, getOriginalIndex } = data;
  const row = rows[index];
  prepareRow(row);
  const originalIndex = getOriginalIndex ? getOriginalIndex(row) : index;
  const isCurrentRow = originalIndex === currentPreviewIndex;

  return (
    <div
      aria-current={isCurrentRow ? "true" : undefined}
      tabIndex={0}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        backgroundColor: isCurrentRow ? COLORS.highlightBg : undefined,
        borderBottom: `1px solid ${COLORS.borderGray}`,
        cursor: "pointer",
        transition: "background-color 0.15s ease"
      }}
      className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
        !isCurrentRow ? "hover:bg-gray-50" : ""
      }`}
      onClick={() => setCurrentPreviewIndex(originalIndex)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCurrentPreviewIndex(originalIndex);
        }
      }}
      title={isCurrentRow ? "Currently viewing this entry" : "Click to view this entry"}
    >
      {row.cells.map((cell: Cell<TableData>) => (
        <div
          key={cell.column.id}
          className={`px-4 py-2 text-sm ${
            isCurrentRow ? "text-amber-900 font-medium" : "text-gray-900"
          }`}
          style={{
            flex: `0 0 ${100 / row.cells.length}%`,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {cell.render("Cell")}
        </div>
      ))}
    </div>
  );
}, areEqual);

export function VirtualizedTable({
  rows,
  prepareRow,
  currentPreviewIndex,
  setCurrentPreviewIndex,
  height,
  getOriginalIndex
}: VirtualizedTableProps) {
  const itemData = useMemo<RowData>(
    () => ({ rows, prepareRow, currentPreviewIndex, setCurrentPreviewIndex, getOriginalIndex }),
    [rows, prepareRow, currentPreviewIndex, setCurrentPreviewIndex, getOriginalIndex]
  );

  return (
    <List
      height={Math.min(height, rows.length * ROW_HEIGHT)}
      itemCount={rows.length}
      itemSize={ROW_HEIGHT}
      itemData={itemData}
      width="100%"
    >
      {VirtualizedRow}
    </List>
  );
}
