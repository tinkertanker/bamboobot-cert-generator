import { renderHook, act } from '@testing-library/react';
import { useTableData } from '../../hooks/useTableData';

describe('useTableData Auto-Detection', () => {
  describe('CSV vs TSV Detection', () => {
    it('should detect CSV format with commas', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        // Simulate pasting CSV data
        const csvData = 'Name,Email,Department\nJohn Doe,john@example.com,Engineering\nJane Smith,jane@example.com,Marketing';
        const event = {
          target: { value: csvData }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.useCSVMode).toBe(true);
      expect(result.current.tableData).toHaveLength(2);
    });

    it('should detect TSV format with tabs', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        // Simulate pasting TSV data
        const tsvData = 'Name\tEmail\tDepartment\nJohn Doe\tjohn@example.com\tEngineering\nJane Smith\tjane@example.com\tMarketing';
        const event = {
          target: { value: tsvData }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.useCSVMode).toBe(false);
      expect(result.current.tableData).toHaveLength(2);
    });

    it('should prefer CSV when both commas and tabs are present', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        // Data with both commas and tabs (common from Excel)
        const mixedData = 'Name,Email,Department\tExtra\nJohn,john@example.com,Engineering\tData\nJane,jane@example.com,Marketing\tMore';
        const event = {
          target: { value: mixedData }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.useCSVMode).toBe(true);
    });
  });

  describe('Header Detection', () => {
    it('should detect obvious headers', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        const dataWithHeaders = 'Name,Email,Department\nJohn Doe,john@example.com,Engineering\nJane Smith,jane@example.com,Marketing';
        const event = {
          target: { value: dataWithHeaders }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.isFirstRowHeader).toBe(true);
      expect(result.current.detectedEmailColumn).toBe('Email');
    });

    it('should not detect headers when first row looks like data', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        const dataWithoutHeaders = 'John Doe,john@example.com,Engineering\nJane Smith,jane@example.com,Marketing\nBob Johnson,bob@example.com,Sales';
        const event = {
          target: { value: dataWithoutHeaders }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.isFirstRowHeader).toBe(false);
    });

    it('should detect email headers specifically', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        const dataWithEmailHeader = 'Full Name,E-mail,Job Title\nJohn Doe,john@example.com,Engineer\nJane Smith,jane@example.com,Manager';
        const event = {
          target: { value: dataWithEmailHeader }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.isFirstRowHeader).toBe(true);
      expect(result.current.detectedEmailColumn).toBe('E-mail');
    });

    it('should handle single row data gracefully', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        const singleRow = 'John Doe,john@example.com,Engineering';
        const event = {
          target: { value: singleRow }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      // Should not auto-detect headers for single row
      expect(result.current.isFirstRowHeader).toBe(false);
      expect(result.current.tableData).toHaveLength(1);
    });
  });

  describe('Combined Detection', () => {
    it('should detect both CSV format and headers together', () => {
      const { result } = renderHook(() => useTableData());
      
      act(() => {
        const csvWithHeaders = '"Full Name","Email Address","Department"\n"John Doe","john@example.com","Engineering"\n"Jane Smith","jane@example.com","Marketing"';
        const event = {
          target: { value: csvWithHeaders }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      expect(result.current.useCSVMode).toBe(true);
      expect(result.current.isFirstRowHeader).toBe(true);
      expect(result.current.detectedEmailColumn).toBe('Email Address');
      expect(result.current.tableData).toHaveLength(2);
    });

    it('should not override manual settings when data is added incrementally', () => {
      const { result } = renderHook(() => useTableData());
      
      // First set manual settings
      act(() => {
        result.current.handleCSVModeToggle(); // Enable CSV mode
      });
      
      act(() => {
        result.current.handleHeaderToggle(); // Enable headers
      });
      
      expect(result.current.useCSVMode).toBe(true);
      expect(result.current.isFirstRowHeader).toBe(true);
      
      // Then add data that might suggest different settings
      act(() => {
        const tsvData = 'data1\tdata2\tdata3\nvalue1\tvalue2\tvalue3';
        const event = {
          target: { value: tsvData }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        result.current.handleTableDataChange(event);
      });
      
      // Should detect and switch to TSV since it's clearly TSV format
      expect(result.current.useCSVMode).toBe(false);
    });
  });
});