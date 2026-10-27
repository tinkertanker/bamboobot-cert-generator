import { useState, useCallback, useRef } from "react";
import type { TableData } from "@/types/certificate";
import { parseRecipientsDetailed } from "@/utils/email-validation";
import { MAX_TABLE_TEXT, TABLE_LIMIT_ERROR, tableSizeError } from '@/utils/input-bounds';

export interface UseTableDataReturn {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  detectedEmailColumn: string | null;
  hasEmailColumn: boolean;
  isProcessingData: boolean;
  dataError: string | null;
  handleTableDataChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleHeaderToggle: () => void;
  handleCSVModeToggle: () => void;
  loadPresetData: (csvData: string) => Promise<void>;
  clearData: () => void;
  loadSessionData: (input: string, csvMode: boolean, headerRow: boolean) => Promise<void>;
}

// Helper function to parse CSV with proper quote handling
const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // RFC-4180: an escaped quote ("") inside a quoted field is a literal quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

// Auto-detect if data is CSV or TSV based on content
const detectFormat = (input: string): boolean => {
  const lines = input.trim().split('\n');
  if (lines.length === 0) return false; // Default to TSV
  
  let csvScore = 0;
  let tsvScore = 0;
  
  // Analyze first few lines (up to 3)
  const sampleLines = lines.slice(0, Math.min(3, lines.length));
  
  for (const line of sampleLines) {
    const commaCount = (line.match(/,/g) || []).length;
    const tabCount = (line.match(/\t/g) || []).length;
    
    // Count commas and tabs
    csvScore += commaCount;
    tsvScore += tabCount;
    
    // Bonus points for quoted fields (more common in CSV)
    if (line.includes('"')) {
      csvScore += 2;
    }
    
    // If we have both commas and tabs, lean towards CSV
    // (common when people paste from Excel which might have both)
    if (commaCount > 0 && tabCount > 0) {
      csvScore += 1;
    }
  }
  
  // Return true for CSV if CSV score is higher
  return csvScore > tsvScore;
};

// Auto-detect if first row looks like headers
const detectHeaders = (input: string, isCSV: boolean): boolean => {
  const lines = input.trim().split('\n');
  if (lines.length < 2) return false; // Need at least 2 rows to compare
  
  const delimiter = isCSV ? ',' : '\t';
  
  // Parse first two rows
  const firstRow = isCSV ? parseCSVRow(lines[0]) : lines[0].split(delimiter);
  const secondRow = isCSV ? parseCSVRow(lines[1]) : lines[1].split(delimiter);
  
  if (firstRow.length !== secondRow.length) return false; // Different column counts
  
  let headerScore = 0;
  const totalColumns = firstRow.length;
  
  for (let i = 0; i < totalColumns; i++) {
    const firstValue = firstRow[i]?.trim() || '';
    const secondValue = secondRow[i]?.trim() || '';
    
    // Penalty if first row also looks like data (especially emails)
    if (firstValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(firstValue)) {
      headerScore -= 3; // Strong penalty for email in header position
    } else if (firstValue) {
      // Only score positively if it's NOT an email
      
      // Headers are usually short text without special characters
      if (firstValue.length < 30 && !/^\d+$/.test(firstValue)) {
        headerScore += 1;
      }
      
      // Common header patterns
      if (/^(name|email|id|date|title|department|company|phone|address|city|state|country|zip|code|number|amount|price|quantity|description|notes?|comment|status|type|category|tag|group|class|level|grade|score|result|value|data|info|information|detail|record|entry|item|product|service|order|invoice|receipt|bill|payment|transaction|account|user|customer|client|contact|person|individual|participant|attendee|member|subscriber|follower|friend|colleague|partner|vendor|supplier|provider|manager|admin|administrator|owner|creator|author|editor|moderator|reviewer|approver|supervisor|director|executive|president|ceo|cfo|cto|hr|sales|marketing|support|finance|accounting|legal|it|tech|engineering|design|development|research|analytics|operations|logistics|shipping|delivery|warehouse|inventory|stock|supply|demand|forecast|budget|cost|revenue|profit|loss|margin|tax|discount|coupon|promo|campaign|project|task|milestone|deadline|priority|urgency|importance|complexity|difficulty|effort|time|duration|start|end|begin|finish|complete|progress|percentage|percent|\%|status|stage|phase|step|sequence|order|rank|position|index|number|count|total|sum|average|mean|median|mode|min|max|range|variance|deviation|correlation|trend|pattern|insight|conclusion|recommendation|action|decision|approval|rejection|acceptance|confirmation|verification|validation|authentication|authorization|permission|access|security|privacy|confidential|public|private|internal|external|visible|hidden|active|inactive|enabled|disabled|online|offline|available|unavailable|open|closed|locked|unlocked|free|busy|occupied|vacant|reserved|booked|scheduled|planned|actual|estimated|expected|predicted|forecasted|target|goal|objective|requirement|specification|criteria|condition|rule|policy|procedure|process|workflow|method|approach|technique|strategy|tactic|plan|scheme|model|framework|structure|architecture|design|layout|format|template|pattern|style|theme|version|revision|edition|release|update|upgrade|patch|fix|bug|issue|problem|error|exception|warning|alert|notification|message|communication|feedback|review|rating|score|evaluation|assessment|analysis|report|summary|overview|detail|description)$/i.test(firstValue)) {
        headerScore += 2;
      }
      
      // Email column detection
      if (/^(email|e-?mail|mail|address|contact)$/i.test(firstValue)) {
        headerScore += 3;
      }
    }
    
    // Check if second row looks like data (not headers)
    if (secondValue) {
      // Data often contains numbers, emails, or longer text
      if (/^\d+$/.test(secondValue) || 
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(secondValue) ||
          secondValue.length > 50) {
        headerScore += 1;
      }
    }
  }
  
  // If more than 75% of columns look like headers, assume first row is headers
  const ratio = headerScore / totalColumns;
  return ratio > 0.75;
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
    for (const header of headers) {
      // Check if at least 50% of non-empty values in this column look like emails
      const columnValues = data
        .map((row) => row[header])
        .filter((val) => val && val.trim() !== "");

      if (columnValues.length > 0) {
        const emailCount = columnValues.filter(
          (val) => parseRecipientsDetailed(val).valid.length > 0
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
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);
  // Whether a table is currently loaded. Used to show the loading skeleton only
  // for an initial large load: re-showing it on every edit of an existing
  // large table would unmount/remount the whole table (and add a 50ms delay)
  // on each keystroke in the data textarea.
  const hasTableDataRef = useRef(false);

  const processTableData = useCallback(async (
    input: string,
    useHeaderRow: boolean,
    csvMode: boolean
  ) => {
    setDataError(null);
    if (input.length > MAX_TABLE_TEXT) {
      setDataError(TABLE_LIMIT_ERROR);
      return false;
    }
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      hasTableDataRef.current = false;
      setTableData([]);
      setDetectedEmailColumn(null);
      setTableInput(input);
      setUseCSVMode(csvMode);
      setIsFirstRowHeader(useHeaderRow);
      return true;
    }

    // For large datasets, show loading state on the initial load
    const lines = trimmedInput.split("\n");
    if (lines.length > 100 && !hasTableDataRef.current) {
      setIsProcessingData(true);
      // Small delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
      if (lines.length === 0) return;

      const delimiter = csvMode ? "," : "\t";

      const rows = lines.map((row) => {
        if (csvMode) {
          return parseCSVRow(row);
        } else {
          return row.split(delimiter);
        }
      });
      if (rows.length === 0) return;

      const error = tableSizeError(rows.length - (useHeaderRow ? 1 : 0), rows[0].length, input.length);
      if (error || rows.some(row => row.some(value => value.length > 2000))) {
        setDataError(error || 'Field values are limited to 2000 characters');
        return false;
      }
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
      
      hasTableDataRef.current = processedTableData.length > 0;
      setTableData(processedTableData);
      setTableInput(input);
      setUseCSVMode(csvMode);
      setIsFirstRowHeader(useHeaderRow);
      setDetectedEmailColumn(detectEmailColumn(headers, processedTableData));
      return true;
    } finally {
      setIsProcessingData(false);
    }
  }, []);

  const handleTableDataChange = useCallback(async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newInput = event.target.value;
    if (newInput.length > MAX_TABLE_TEXT) {
      await processTableData(newInput, isFirstRowHeader, useCSVMode);
      return;
    }
    const csvMode = newInput.trim() ? detectFormat(newInput) : useCSVMode;
    const headerRow = newInput.trim() ? detectHeaders(newInput, csvMode) : isFirstRowHeader;
    // Rejected edits must not replace the accepted state consumed by autosave.
    await processTableData(newInput, headerRow, csvMode);
  }, [isFirstRowHeader, useCSVMode, processTableData]);

  const handleHeaderToggle = useCallback(async () => {
    await processTableData(tableInput, !isFirstRowHeader, useCSVMode);
  }, [tableInput, isFirstRowHeader, useCSVMode, processTableData]);

  const handleCSVModeToggle = useCallback(async () => {
    await processTableData(tableInput, isFirstRowHeader, !useCSVMode);
  }, [tableInput, isFirstRowHeader, useCSVMode, processTableData]);

  const loadPresetData = useCallback(async (csvData: string) => {
    await processTableData(csvData, true, true);
  }, [processTableData]);

  const clearData = useCallback(() => {
    hasTableDataRef.current = false;
    setDataError(null);
    setTableData([]);
    setTableInput("");
    setDetectedEmailColumn(null);
  }, []);

  // Load session data with explicit settings (no auto-detection)
  const loadSessionData = useCallback(async (
    input: string,
    csvMode: boolean,
    headerRow: boolean
  ) => {
    if (!await processTableData(input, headerRow, csvMode)) {
      throw new Error('Saved table data exceeds the supported limits');
    }
  }, [processTableData]);

  return {
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    detectedEmailColumn,
    hasEmailColumn: detectedEmailColumn !== null,
    isProcessingData,
    dataError,
    handleTableDataChange,
    handleHeaderToggle,
    handleCSVModeToggle,
    loadPresetData,
    clearData,
    loadSessionData,
  };
}
