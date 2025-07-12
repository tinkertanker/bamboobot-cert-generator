import React, { useState, useMemo } from "react";
import { Mail } from "lucide-react";
import { ProcessingDataSkeleton } from "@/components/ui/enhanced-skeleton";
import { VirtualizedTable } from "@/components/VirtualizedTable";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { COLORS } from "@/utils/styles";
import type { DataPanelProps, TableData } from "@/types/certificate";
import type { HeaderGroup, Row, Cell, ColumnInstance } from "react-table";
import { useTable } from "react-table";

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
  isProcessing = false
}: Omit<DataPanelProps, 'getTableProps' | 'getTableBodyProps'> & { isProcessing?: boolean }) {
  const [filteredData, setFilteredData] = useState<TableData[]>(tableData);

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

  // Update filtered data when table data changes
  React.useEffect(() => {
    setFilteredData(tableData);
  }, [tableData]);

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
            <ProcessingDataSkeleton />
          </div>
        ) : tableData.length > 0 ? (
          <div className="mt-4 flex-1 min-h-0">
            {/* Smart Search Bar */}
            <SmartSearchBar
              tableData={tableData}
              onFilteredDataChange={setFilteredData}
              columns={columnNames}
            />
            
            <div className="h-full border border-gray-200 rounded-lg overflow-hidden">
              {/* Table Header - Keep outside virtualization for sticky behavior */}
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white" {...getTableProps()}>
                  <thead
                    className="sticky top-0 z-10"
                    style={{ backgroundColor: COLORS.tabInactive }}>
                    {headerGroups.map(
                      (headerGroup: HeaderGroup<TableData>, index) => (
                        <tr {...headerGroup.getHeaderGroupProps()} key={headerGroup.id || `header-${index}`}>
                          {headerGroup.headers.map(
                            (column: ColumnInstance<TableData>) => (
                              <th
                                {...column.getHeaderProps()}
                                key={column.id}
                                className="px-4 py-2 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                style={{
                                  width: `${100 / headerGroup.headers.length}%`
                                }}>
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
                </table>
              </div>
              
              {/* Virtualized Table Body */}
              {rows.length > 100 ? (
                <VirtualizedTable
                  rows={rows}
                  prepareRow={prepareRow}
                  currentPreviewIndex={currentPreviewIndex}
                  setCurrentPreviewIndex={setCurrentPreviewIndex}
                  height={250} // Reduced height to account for search bar
                />
              ) : (
                /* Regular table for small datasets */
                <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
                  <table className="min-w-full bg-white" {...getTableProps()}>
                    <tbody {...getTableBodyProps()}>
                      {rows.map((row: Row<TableData>, index) => {
                        prepareRow(row);
                        const isCurrentRow = index === currentPreviewIndex;
                        return (
                          <tr
                            {...row.getRowProps()}
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
                                {...cell.getCellProps()}
                                key={cell.column.id}
                                className={`px-4 py-2 border-b border-gray-200 text-sm ${
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