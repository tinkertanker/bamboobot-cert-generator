import { useState, useCallback } from "react";
import type { TableData } from "@/types/certificate";

export interface UseTableDataReturn {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  detectedEmailColumn: string | null;
  handleTableDataChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleHeaderToggle: () => void;
  handleCSVModeToggle: () => void;
  loadPresetData: (csvData: string) => void;
  clearData: () => void;
}

// Helper function to parse CSV with proper quote handling
const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

// Detect email column from headers and data
const detectEmailColumn = (headers: string[], data: TableData[]): string | null => {
  // First try to detect by header name
  const emailHeaderPatterns =
    /^(email|e-mail|mail|email address|e-mail address|correo|courriel)$/i;
  let emailColumn = headers.find((header) =>
    emailHeaderPatterns.test(header.trim())
  );

  // If not found by header, try to detect by content
  if (!emailColumn && data.length > 0) {
    const emailContentPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const header of headers) {
      // Check if at least 50% of non-empty values in this column look like emails
      const columnValues = data
        .map((row) => row[header])
        .filter((val) => val && val.trim() !== "");

      if (columnValues.length > 0) {
        const emailCount = columnValues.filter((val) =>
          emailContentPattern.test(val.trim())
        ).length;

        if (emailCount / columnValues.length >= 0.5) {
          emailColumn = header;
          break;
        }
      }
    }
  }

  return emailColumn || null;
};

export function useTableData(initialCsv?: string): UseTableDataReturn {
  const [tableData, setTableData] = useState<TableData[]>([]);
  const [tableInput, setTableInput] = useState<string>(initialCsv || "");
  const [isFirstRowHeader, setIsFirstRowHeader] = useState<boolean>(false);
  const [useCSVMode, setUseCSVMode] = useState<boolean>(false); // Default to TSV
  const [detectedEmailColumn, setDetectedEmailColumn] = useState<string | null>(null);

  const processTableData = useCallback((
    input: string,
    useHeaderRow: boolean,
    csvMode: boolean
  ) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setTableData([]);
      setDetectedEmailColumn(null);
      return;
    }

    const lines = trimmedInput.split("\n");
    if (lines.length === 0) return;

    // Use the format selected by the user toggle
    const delimiter = csvMode ? "," : "\t";
    console.log(`Using ${csvMode ? "CSV" : "TSV"} mode`);

    const rows = lines.map((row) => {
      if (csvMode) {
        return parseCSVRow(row);
      } else {
        return row.split(delimiter);
      }
    });
    if (rows.length === 0) return;

    const headers = useHeaderRow
      ? rows[0].map((header, index) => header || `_column_${index}`) // Handle blank headers
      : rows[0].map((_, index) => `Column ${index + 1}`);
    const data = useHeaderRow ? rows.slice(1) : rows;
    const processedTableData = data.map((row) => {
      const obj: TableData = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || "";
      });
      return obj;
    });
    
    setTableData(processedTableData);

    // Auto-detect email column
    const emailCol = detectEmailColumn(headers, processedTableData);
    console.log("📊 useTableData: Detected email column:", emailCol);
    setDetectedEmailColumn(emailCol);
  }, []);

  const handleTableDataChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newInput = event.target.value;
    setTableInput(newInput);
    if (newInput.trim() === "") {
      setTableData([]);
      setDetectedEmailColumn(null);
    } else {
      processTableData(newInput, isFirstRowHeader, useCSVMode);
    }
  }, [isFirstRowHeader, useCSVMode, processTableData]);

  const handleHeaderToggle = useCallback(() => {
    setIsFirstRowHeader((prev) => {
      const newValue = !prev;
      if (tableInput.trim()) {
        processTableData(tableInput, newValue, useCSVMode);
      }
      return newValue;
    });
  }, [tableInput, useCSVMode, processTableData]);

  const handleCSVModeToggle = useCallback(() => {
    setUseCSVMode((prev) => {
      const newValue = !prev;
      // Reprocess data with new format
      if (tableInput.trim()) {
        processTableData(tableInput, isFirstRowHeader, newValue);
      }
      return newValue;
    });
  }, [tableInput, isFirstRowHeader, processTableData]);

  const loadPresetData = useCallback((csvData: string) => {
    setUseCSVMode(true);
    setIsFirstRowHeader(true);
    setTableInput(csvData);
    processTableData(csvData, true, true);
  }, [processTableData]);

  const clearData = useCallback(() => {
    setTableData([]);
    setTableInput("");
    setDetectedEmailColumn(null);
  }, []);

  return {
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    detectedEmailColumn,
    handleTableDataChange,
    handleHeaderToggle,
    handleCSVModeToggle,
    loadPresetData,
    clearData,
  };
}