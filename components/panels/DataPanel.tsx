import React from "react";
import { Mail } from "lucide-react";
import { TableSkeleton } from "@/components/ui/skeleton";
import { COLORS } from "@/utils/styles";
import type { DataPanelProps, TableData } from "@/types/certificate";
import type { HeaderGroup, Row, Cell, ColumnInstance } from "react-table";

export function DataPanel({
  tableInput,
  handleTableDataChange,
  isFirstRowHeader,
  handleHeaderToggle,
  useCSVMode,
  handleCSVModeToggle,
  tableData,
  getTableProps,
  getTableBodyProps,
  headerGroups,
  rows,
  prepareRow,
  detectedEmailColumn,
  currentPreviewIndex,
  setCurrentPreviewIndex,
  isProcessing = false
}: DataPanelProps & { isProcessing?: boolean }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-6 mb-4">
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
      <div className="flex flex-col h-[480px]">
        <textarea
          value={tableInput}
          onChange={handleTableDataChange}
          placeholder={
            useCSVMode
              ? "Paste CSV data here (e.g., John Doe,Manager,Sales)"
              : "Paste TSV data here (tab-separated)"
          }
          className="w-full resize-none px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{ height: "154px" }}
        />
        {isProcessing ? (
          <div className="mt-4 flex-1 min-h-0">
            <TableSkeleton rows={5} />
          </div>
        ) : tableData.length > 0 ? (
          <div className="mt-4 flex-1 min-h-0">
            <div className="h-full overflow-y-auto border border-gray-200 rounded-lg">
              <table
                {...getTableProps()}
                className="min-w-full bg-white">
                <thead
                  className="sticky top-0"
                  style={{ backgroundColor: COLORS.tabInactive }}>
                  {headerGroups.map(
                    (headerGroup: HeaderGroup<TableData>, index) => (
                      <tr key={headerGroup.id || `header-${index}`}>
                        {headerGroup.headers.map(
                          (column: ColumnInstance<TableData>) => (
                            <th
                              className="px-4 py-2 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              key={column.id}>
                              <div className="flex items-center gap-2">
                                {column.render("Header")}
                                {detectedEmailColumn === column.id && (
                                  <div title="Email column detected">
                                    <Mail className="h-3 w-3 text-blue-600" />
                                  </div>
                                )}
                              </div>
                            </th>
                          )
                        )}
                      </tr>
                    )
                  )}
                </thead>
                <tbody {...getTableBodyProps()}>
                  {rows.map((row: Row<TableData>, index) => {
                    prepareRow(row);
                    const isCurrentRow = index === currentPreviewIndex;
                    return (
                      <tr
                        key={row.id || index}
                        className={`${
                          isCurrentRow ? "" : "hover:bg-gray-50"
                        } transition-colors cursor-pointer`}
                        style={{
                          backgroundColor: isCurrentRow
                            ? COLORS.highlightBg
                            : "transparent",
                          borderColor: isCurrentRow
                            ? COLORS.highlightBorder
                            : "transparent"
                        }}
                        onClick={() => setCurrentPreviewIndex(index)}
                        title={
                          isCurrentRow
                            ? "Currently viewing this entry"
                            : "Click to view this entry"
                        }>
                        {row.cells.map((cell: Cell<TableData>) => (
                          <td
                            className={`px-4 py-2 border-b border-gray-200 text-sm ${
                              isCurrentRow
                                ? "text-amber-900 font-medium"
                                : "text-gray-900"
                            }`}
                            key={cell.column.id}>
                            {cell.render("Cell")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}