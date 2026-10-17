import React, { useCallback, useMemo, useRef } from "react";
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
  /** Position of the single row that is in the tab order (roving tabindex) */
  tabStopPosition: number;
  onRowKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, position: number) => void;
}

const ROW_HEIGHT = 41; // Height of each row in pixels (py-2 + border)

// Defined at module level (not recreated per render) so react-window keeps the
// same component type and only re-renders rows instead of remounting them.
const VirtualizedRow = React.memo(function VirtualizedRow({
  index,
  style,
  data
}: ListChildComponentProps<RowData>) {
  const {
    rows,
    prepareRow,
    currentPreviewIndex,
    setCurrentPreviewIndex,
    getOriginalIndex,
    tabStopPosition,
    onRowKeyDown
  } = data;
  const row = rows[index];
  prepareRow(row);
  const originalIndex = getOriginalIndex ? getOriginalIndex(row) : index;
  const isCurrentRow = originalIndex === currentPreviewIndex;

  return (
    <div
      role="button"
      data-row-position={index}
      aria-current={isCurrentRow ? "true" : undefined}
      tabIndex={index === tabStopPosition ? 0 : -1}
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
      onKeyDown={(e) => onRowKeyDown(e, index)}
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
  const listRef = useRef<List<RowData>>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const originalIndexAt = useCallback(
    (position: number) =>
      getOriginalIndex ? getOriginalIndex(rows[position]) : position,
    [rows, getOriginalIndex]
  );

  // Only the current row (or the first row if it's filtered out) is a tab stop
  const tabStopPosition = useMemo(() => {
    for (let position = 0; position < rows.length; position++) {
      if (originalIndexAt(position) === currentPreviewIndex) return position;
    }
    return 0;
  }, [rows, originalIndexAt, currentPreviewIndex]);

  // Matches the small table: Enter/Space selects, arrows move between rows
  const onRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, position: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setCurrentPreviewIndex(originalIndexAt(position));
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      event.stopPropagation();
      const nextPosition = event.key === "ArrowDown" ? position + 1 : position - 1;
      if (nextPosition < 0 || nextPosition >= rows.length) return;
      setCurrentPreviewIndex(originalIndexAt(nextPosition));
      listRef.current?.scrollToItem(nextPosition);
      // The target row may only mount after scrolling, so focus on the next frame
      requestAnimationFrame(() => {
        outerRef.current
          ?.querySelector<HTMLDivElement>(`[data-row-position="${nextPosition}"]`)
          ?.focus();
      });
    },
    [rows.length, originalIndexAt, setCurrentPreviewIndex]
  );

  const itemData = useMemo<RowData>(
    () => ({
      rows,
      prepareRow,
      currentPreviewIndex,
      setCurrentPreviewIndex,
      getOriginalIndex,
      tabStopPosition,
      onRowKeyDown
    }),
    [
      rows,
      prepareRow,
      currentPreviewIndex,
      setCurrentPreviewIndex,
      getOriginalIndex,
      tabStopPosition,
      onRowKeyDown
    ]
  );

  return (
    <List
      ref={listRef}
      outerRef={outerRef}
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
