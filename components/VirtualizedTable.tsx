import React, { useCallback } from "react";
import { FixedSizeList as List } from "react-window";
import { COLORS } from "@/utils/styles";
import type { TableData } from "@/types/certificate";
import type { Row, Cell } from "react-table";

interface VirtualizedTableProps {
  rows: Row<TableData>[];
  prepareRow: (row: Row<TableData>) => void;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number) => void;
  height: number;
  originalRows?: Row<TableData>[];
}

const ROW_HEIGHT = 41; // Height of each row in pixels (py-2 + border)

export function VirtualizedTable({
  rows,
  prepareRow,
  currentPreviewIndex,
  setCurrentPreviewIndex,
  height,
  originalRows
}: VirtualizedTableProps) {
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const row = rows[index];
      prepareRow(row);
      // Find the original index if filtering is applied
      const originalIndex = originalRows ? originalRows.indexOf(row) : index;
      const isCurrentRow = originalIndex === currentPreviewIndex;

      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            backgroundColor: isCurrentRow ? COLORS.highlightBg : "transparent",
            borderBottom: `1px solid ${COLORS.borderGray}`,
            cursor: "pointer",
            transition: "background-color 0.15s ease"
          }}
          className={!isCurrentRow ? "hover:bg-gray-50" : ""}
          onClick={() => setCurrentPreviewIndex(originalIndex)}
          title={
            isCurrentRow
              ? "Currently viewing this entry"
              : "Click to view this entry"
          }
        >
          {row.cells.map((cell: Cell<TableData>) => (
            <div
              key={cell.column.id}
              className={`px-4 py-2 text-sm ${
                isCurrentRow
                  ? "text-amber-900 font-medium"
                  : "text-gray-900"
              }`}
              style={{
                flex: `0 0 ${100 / row.cells.length}%`,
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
    },
    [rows, prepareRow, currentPreviewIndex, setCurrentPreviewIndex, originalRows]
  );

  return (
    <List
      height={height}
      itemCount={rows.length}
      itemSize={ROW_HEIGHT}
      width="100%"
    >
      {Row}
    </List>
  );
}