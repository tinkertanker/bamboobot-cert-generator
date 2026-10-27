import React, { useState, useMemo, useCallback } from "react";
import { Mail } from "lucide-react";
import { ProcessingDataSkeleton } from "@/components/ui/enhanced-skeleton";
import { VirtualizedTable } from "@/components/VirtualizedTable";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { COLORS } from "@/utils/styles";
import type { DataPanelProps, TableData } from "@/types/certificate";
import type { HeaderGroup, Row, Cell, ColumnInstance } from "react-table";
import { useTable } from "react-table";

const TABLE_BODY_MAX_HEIGHT = 250;
const VIRTUALIZE_THRESHOLD = 100;

export function DataPanelWithSearch({
  tableInput,
  handleTableDataChange,
  isFirstRowHeader,
  handleHeaderToggle,
  useCSVMode,
  handleCSVModeToggle,
  tableData,
  headerGroups: originalHeaderGroups,
  detectedEmailColumn,
  currentPreviewIndex,
  setCurrentPreviewIndex,
  isProcessing = false,
  dataError
}: DataPanelProps & { isProcessing?: boolean; dataError?: string | null }) {
  // Remember which tableData the filtered rows were computed from so a stale
  // filter result is never shown after the data changes.
  const [filterResult, setFilterResult] = useState<{
    source: TableData[];
    rows: TableData[];
  } | null>(null);
  const filteredData =
    filterResult && filterResult.source === tableData
      ? filterResult.rows
      : tableData;
  const handleFilteredDataChange = useCallback(
    (rows: TableData[]) => setFilterResult({ source: tableData, rows }),
    [tableData]
  );

  // Map each row object back to its position in the full dataset so clicks
  // and highlighting refer to the real entry, not the filtered position.
  const originalIndexByRow = useMemo(() => {
    const map = new Map<TableData, number>();
    tableData.forEach((row, index) => map.set(row, index));
    return map;
  }, [tableData]);
  const getOriginalIndex = useCallback(
    (row: Row<TableData>) => originalIndexByRow.get(row.original) ?? row.index,
    [originalIndexByRow]
  );

  // Get column names from the first header group
  const columnNames = useMemo(() => {
    if (originalHeaderGroups.length > 0) {
      return originalHeaderGroups[0].headers.map((header: ColumnInstance<TableData>) => header.Header as string);
    }
    return [];
  }, [originalHeaderGroups]);

  // Create a new table instance with filtered data
  const columns = useMemo(() => {
    if (originalHeaderGroups.length > 0) {
      return originalHeaderGroups[0].headers.map((header: ColumnInstance<TableData>) => ({
        Header: header.Header,
        accessor: header.id
      }));
    }
    return [];
  }, [originalHeaderGroups]);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow
  } = useTable({
    columns,
    data: filteredData
  });

  const currentRowVisible = rows.some(
    (row) => getOriginalIndex(row) === currentPreviewIndex
  );

  // Arrow keys move between rows (and the preview) without nudging the canvas
  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    position: number,
    originalIndex: number
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCurrentPreviewIndex(originalIndex);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const nextPosition = event.key === "ArrowDown" ? position + 1 : position - 1;
    if (nextPosition < 0 || nextPosition >= rows.length) return;
    setCurrentPreviewIndex(getOriginalIndex(rows[nextPosition]));
    const tbody = event.currentTarget.parentElement;
    const nextRow = tbody?.querySelector<HTMLTableRowElement>(
      `[data-row-position="${nextPosition}"]`
    );
    nextRow?.focus();
  };

  const renderHeaderRow = (headerGroup: HeaderGroup<TableData>, index: number) => (
    <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id || `header-${index}`}>
      {headerGroup.headers.map((column: ColumnInstance<TableData>) => (
        <th
          {...column.getHeaderProps()}
          key={column.id}
          scope="col"
          className="px-4 py-2 border-b border-gray-200 text-left text-xs font-medium text-gray-600 uppercase tracking-wider"
          style={{
            width: `${100 / headerGroup.headers.length}%`,
            backgroundColor: COLORS.tabInactive
          }}>
          <div className="flex items-center gap-2">
            {column.render("Header")}
            {detectedEmailColumn === column.id && (
              <span title="Email column detected">
                <Mail className="h-3 w-3 text-blue-600" aria-hidden="true" />
                <span className="sr-only">(email column)</span>
              </span>
            )}
          </div>
        </th>
      ))}
    </tr>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="header-toggle"
            checked={isFirstRowHeader}
            onChange={handleHeaderToggle}
            className="mr-2"
          />
          <label htmlFor="header-toggle" className="text-sm">
            Treat first row as header
          </label>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="csv-mode-toggle"
            checked={useCSVMode}
            onChange={handleCSVModeToggle}
            className="mr-2"
          />
          <label htmlFor="csv-mode-toggle" className="text-sm">
            CSV mode (comma-separated)
          </label>
        </div>
      </div>
      <div className="flex flex-col">
        <label htmlFor="table-data-input" className="sr-only">
          Certificate data
        </label>
        <textarea
          id="table-data-input"
          value={tableInput}
          onChange={handleTableDataChange}
          placeholder={
            useCSVMode
              ? "Paste the text you want to show on the certs here, one per line. You can copy and paste from your spreadsheet (comma-separated format)"
              : "Paste the text you want to show on the certs here, one per line. You can copy and paste from your spreadsheet"
          }
          spellCheck={false}
          className="w-full resize-y min-h-[96px] px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{ height: "154px" }}
        />
        {dataError && <p role="alert" className="mt-2 text-sm text-red-600">{dataError}</p>}
        {isProcessing ? (
          <div className="mt-4" role="status" aria-live="polite">
            <ProcessingDataSkeleton />
          </div>
        ) : tableData.length > 0 ? (
          <div className="mt-4 min-w-0">
            {/* Smart Search Bar */}
            <SmartSearchBar
              tableData={tableData}
              onFilteredDataChange={handleFilteredDataChange}
              columns={columnNames}
            />

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500" role="status">
                  No entries match your search or filters.
                </div>
              ) : rows.length > VIRTUALIZE_THRESHOLD ? (
                <>
                  {/* Header kept outside the virtualised list */}
                  <table className="w-full bg-white table-fixed" {...getTableProps()}>
                    <thead>{headerGroups.map(renderHeaderRow)}</thead>
                  </table>
                  <VirtualizedTable
                    rows={rows}
                    prepareRow={prepareRow}
                    currentPreviewIndex={currentPreviewIndex}
                    setCurrentPreviewIndex={setCurrentPreviewIndex}
                    getOriginalIndex={getOriginalIndex}
                    height={TABLE_BODY_MAX_HEIGHT}
                  />
                </>
              ) : (
                /* Regular table for small datasets: one table so columns line up */
                <div
                  className="overflow-auto"
                  style={{ maxHeight: `${TABLE_BODY_MAX_HEIGHT + 40}px` }}>
                  <table className="min-w-full bg-white" {...getTableProps()}>
                    <thead className="sticky top-0 z-10">
                      {headerGroups.map(renderHeaderRow)}
                    </thead>
                    <tbody {...getTableBodyProps()}>
                      {rows.map((row: Row<TableData>, position) => {
                        prepareRow(row);
                        const originalIndex = getOriginalIndex(row);
                        const isCurrentRow = originalIndex === currentPreviewIndex;
                        const isTabStop = currentRowVisible ? isCurrentRow : position === 0;
                        return (
                          <tr
                            {...row.getRowProps()}
                            key={row.id || position}
                            data-row-position={position}
                            tabIndex={isTabStop ? 0 : -1}
                            aria-current={isCurrentRow ? "true" : undefined}
                            className={`${
                              isCurrentRow ? "" : "hover:bg-gray-50"
                            } transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500`}
                            style={{
                              backgroundColor: isCurrentRow
                                ? COLORS.highlightBg
                                : undefined
                            }}
                            onClick={() => setCurrentPreviewIndex(originalIndex)}
                            onKeyDown={(e) => handleRowKeyDown(e, position, originalIndex)}
                            title={
                              isCurrentRow
                                ? "Currently viewing this entry"
                                : "Click to view this entry"
                            }>
                            {row.cells.map((cell: Cell<TableData>) => (
                              <td
                                {...cell.getCellProps()}
                                key={cell.column.id}
                                className={`px-4 py-2 border-b border-gray-200 text-sm break-words ${
                                  isCurrentRow
                                    ? "text-amber-900 font-medium"
                                    : "text-gray-900"
                                }`}
                                style={{
                                  width: `${100 / row.cells.length}%`
                                }}>
                                {cell.render("Cell")}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
