// CSV/TSV Parser Web Worker
// Handles parsing of large datasets off the main thread

// Parse a single CSV row handling quoted values
function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Don't forget the last field
  if (current || row.endsWith(',')) {
    result.push(current.trim());
  }
  
  return result;
}

// Detect if content is CSV or TSV
function detectFormat(content, sampleSize = 10) {
  const lines = content.split('\n').slice(0, sampleSize).filter(line => line.trim());
  
  let commaCount = 0;
  let tabCount = 0;
  
  for (const line of lines) {
    commaCount += (line.match(/,/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
  }
  
  return tabCount > commaCount ? 'tsv' : 'csv';
}

// Detect headers in the data
function detectHeaders(rows) {
  if (rows.length === 0) return { hasHeaders: false, headers: [] };
  
  const firstRow = rows[0];
  const secondRow = rows[1];
  
  // Check if first row contains typical header patterns
  const headerPatterns = /^(name|email|id|number|date|address|phone|title|first|last|company|organization)/i;
  const hasHeaderPattern = firstRow.some(cell => headerPatterns.test(cell));
  
  // Check if first row has different data types than second row
  let typeMismatch = false;
  if (secondRow) {
    for (let i = 0; i < Math.min(firstRow.length, secondRow.length); i++) {
      const first = firstRow[i];
      const second = secondRow[i];
      
      // Check if first is text and second is number
      if (isNaN(first) && !isNaN(second) && second !== '') {
        typeMismatch = true;
        break;
      }
    }
  }
  
  const hasHeaders = hasHeaderPattern || typeMismatch || rows.length === 1;
  const headers = hasHeaders ? firstRow : firstRow.map((_, i) => `Column ${i + 1}`);
  
  return { hasHeaders, headers };
}

// Detect email column
function detectEmailColumn(headers, rows) {
  // First check headers for email-related names
  const emailHeaderIndex = headers.findIndex(header => 
    /email|e-mail|mail|correo|courriel/i.test(header)
  );
  
  if (emailHeaderIndex !== -1) return emailHeaderIndex;
  
  // Check data for email patterns
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const columnScores = new Array(headers.length).fill(0);
  
  const sampleRows = rows.slice(0, Math.min(10, rows.length));
  for (const row of sampleRows) {
    for (let i = 0; i < row.length; i++) {
      if (emailRegex.test(row[i])) {
        columnScores[i]++;
      }
    }
  }
  
  // Find column with most email matches
  const maxScore = Math.max(...columnScores);
  return maxScore > 0 ? columnScores.indexOf(maxScore) : -1;
}

// Main parsing function
function parseTableData(content, options = {}) {
  const { 
    format = 'auto',
    hasHeaders = 'auto',
    progressCallback 
  } = options;
  
  // Detect format if auto
  const detectedFormat = format === 'auto' ? detectFormat(content) : format;
  const delimiter = detectedFormat === 'tsv' ? '\t' : ',';
  
  // Split into lines
  const lines = content.split('\n').filter(line => line.trim());
  
  // Parse rows
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (progressCallback && i % 100 === 0) {
      progressCallback({
        type: 'PROGRESS',
        progress: (i / lines.length) * 50, // First 50% for parsing
        message: `Parsing row ${i} of ${lines.length}...`
      });
    }
    
    const line = lines[i];
    const row = detectedFormat === 'tsv' 
      ? line.split(delimiter).map(cell => cell.trim())
      : parseCSVRow(line);
    
    if (row.length > 0 && row.some(cell => cell)) {
      rows.push(row);
    }
  }
  
  // Detect headers if auto
  const { hasHeaders: detectedHeaders, headers } = 
    hasHeaders === 'auto' ? detectHeaders(rows) : 
    { hasHeaders, headers: hasHeaders ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`) };
  
  // Extract data rows
  const dataRows = detectedHeaders && rows.length > 0 ? rows.slice(1) : rows;
  
  // Detect email column
  const emailColumnIndex = detectEmailColumn(headers, dataRows);
  
  // Convert to table data format
  const tableData = [];
  for (let i = 0; i < dataRows.length; i++) {
    if (progressCallback && i % 100 === 0) {
      progressCallback({
        type: 'PROGRESS',
        progress: 50 + (i / dataRows.length) * 50, // Last 50% for conversion
        message: `Processing row ${i} of ${dataRows.length}...`
      });
    }
    
    const row = dataRows[i];
    const rowData = {};
    
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = row[j] || '';
      
      rowData[header] = {
        text: value,
        isEmail: j === emailColumnIndex
      };
    }
    
    tableData.push(rowData);
  }
  
  return {
    headers,
    data: tableData,
    format: detectedFormat,
    emailColumn: emailColumnIndex !== -1 ? headers[emailColumnIndex] : null,
    rowCount: tableData.length,
    columnCount: headers.length
  };
}

// Message handler
self.addEventListener('message', (event) => {
  const { type, id, data } = event.data;
  
  try {
    switch (type) {
      case 'PARSE_CSV':
        const { content, options } = data;
        
        // Parse with progress reporting
        const result = parseTableData(content, {
          ...options,
          progressCallback: (progress) => {
            self.postMessage({
              ...progress,
              id
            });
          }
        });
        
        self.postMessage({
          type: 'SUCCESS',
          id,
          result
        });
        break;
        
      case 'PARSE_CHUNK':
        // For streaming large files
        const { chunk, state } = data;
        // Implementation for chunked parsing would go here
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error.message
    });
  }
});