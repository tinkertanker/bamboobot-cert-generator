import { useState, useCallback } from "react";
import type { TableData } from "@/types/certificate";

export interface UseTableDataReturn {
  tableData: TableData[];
  tableInput: string;
  isFirstRowHeader: boolean;
  useCSVMode: boolean;
  detectedEmailColumn: string | null;
  isProcessingData: boolean;
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
  const [isProcessingData, setIsProcessingData] = useState<boolean>(false);

  const processTableData = useCallback(async (
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

    // For large datasets, show loading state
    const lines = trimmedInput.split("\n");
    if (lines.length > 100) {
      setIsProcessingData(true);
      // Small delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    try {
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
    } finally {
      setIsProcessingData(false);
    }
  }, []);

  const handleTableDataChange = useCallback(async (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newInput = event.target.value;
    setTableInput(newInput);
    if (newInput.trim() === "") {
      setTableData([]);
      setDetectedEmailColumn(null);
    } else {
      // Auto-detect format and headers when data is pasted/entered
      const detectedCSV = detectFormat(newInput);
      const detectedHeaders = detectHeaders(newInput, detectedCSV);
      
      // Only auto-switch if different from current settings
      let shouldUpdateCSV = false;
      let shouldUpdateHeaders = false;
      
      if (detectedCSV !== useCSVMode) {
        setUseCSVMode(detectedCSV);
        shouldUpdateCSV = true;
        console.log(`📊 Auto-detected format: ${detectedCSV ? 'CSV' : 'TSV'}`);
      }
      
      if (detectedHeaders !== isFirstRowHeader) {
        setIsFirstRowHeader(detectedHeaders);
        shouldUpdateHeaders = true;
        console.log(`📊 Auto-detected headers: ${detectedHeaders ? 'Yes' : 'No'}`);
      }
      
      // Process data with detected or current settings
      await processTableData(
        newInput, 
        shouldUpdateHeaders ? detectedHeaders : isFirstRowHeader, 
        shouldUpdateCSV ? detectedCSV : useCSVMode
      );
    }
  }, [isFirstRowHeader, useCSVMode, processTableData]);

  const handleHeaderToggle = useCallback(async () => {
    setIsFirstRowHeader((prev) => {
      const newValue = !prev;
      if (tableInput.trim()) {
        processTableData(tableInput, newValue, useCSVMode);
      }
      return newValue;
    });
  }, [tableInput, useCSVMode, processTableData]);

  const handleCSVModeToggle = useCallback(async () => {
    setUseCSVMode((prev) => {
      const newValue = !prev;
      // Reprocess data with new format
      if (tableInput.trim()) {
        processTableData(tableInput, isFirstRowHeader, newValue);
      }
      return newValue;
    });
  }, [tableInput, isFirstRowHeader, processTableData]);

  const loadPresetData = useCallback(async (csvData: string) => {
    setUseCSVMode(true);
    setIsFirstRowHeader(true);
    setTableInput(csvData);
    await processTableData(csvData, true, true);
  }, [processTableData]);

  const clearData = useCallback(() => {
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
    setTableInput(input);
    setUseCSVMode(csvMode);
    setIsFirstRowHeader(headerRow);
    
    if (input.trim()) {
      await processTableData(input, headerRow, csvMode);
    }
  }, [processTableData]);

  return {
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    detectedEmailColumn,
    isProcessingData,
    handleTableDataChange,
    handleHeaderToggle,
    handleCSVModeToggle,
    loadPresetData,
    clearData,
    loadSessionData,
  };
}