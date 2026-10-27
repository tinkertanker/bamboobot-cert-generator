import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useTableData } from '../../hooks/useTableData';
import { useProjectAutosave } from '@/hooks/useProjectAutosave';
import { useSessionAutosave } from '@/hooks/useSessionAutosave';
import { useProjectManagement } from '@/hooks/useProjectManagement';
import { ProjectStorage } from '@/lib/project-storage';
import { SessionStorage } from '@/lib/session-storage';
import { QUARANTINE_PREFIX } from '@/lib/storage/account-scope';
import type { Positions, EmailConfig } from '@/types/certificate';

describe('useTableData Auto-Detection', () => {
  it('reuses a verified recovery copy across reloads without a saved project', async () => {
    localStorage.clear();
    const key = 'bamboobot_current_session_v1';
    const original = '{"tableInput":"Recoverable Alice"';
    localStorage.setItem(key, original);
    const mount = () => renderHook(() => {
      const table = useTableData();
      const project = useProjectManagement({
        setPositions: () => {}, setUploadedFileUrl: () => {}, setUploadedFile: () => {}, setEmailConfig: () => {},
        loadSessionData: table.loadSessionData, uploadToServer: async () => undefined,
        showToast: () => {}, manualSave: async () => ({ success: true }),
        uploadedFileUrl: null, uploadedFile: null, positions: {}, emailConfig: {} as EmailConfig,
        tableData: table.tableData, automaticTextColorResult: null,
        clearFile: () => {}, clearPositions: () => {}, clearDragState: () => {}, clearData: table.clearData,
      });
      useSessionAutosave({ ...table,
        enabled: project.hasManuallySaved && !project.sessionAutosaveBlocked && table.tableData.length > 0 });
      return project;
    });
    const archives = () => Object.keys(localStorage).filter(name => name.startsWith(QUARANTINE_PREFIX))
      .map(name => localStorage.getItem(name));
    try {
      for (let reload = 0; reload < 3; reload++) {
        const { result, unmount } = mount();
        try {
          await act(async () => {});
          expect(result.current.currentProjectId).toBeNull();
          expect(result.current.sessionAutosaveBlocked).toBe(false);
          expect(localStorage.getItem(key)).toBe(original);
          expect(archives()).toEqual([JSON.stringify({ [key]: original })]);
        } finally { unmount(); }
      }
      // A different rejected value must retain its own recovery copy.
      const changed = '{"tableInput":"Recoverable Bob"';
      localStorage.setItem(key, changed);
      const changedMount = mount();
      try { await act(async () => {}); } finally { changedMount.unmount(); }
      expect(archives()).toEqual(expect.arrayContaining([
        JSON.stringify({ [key]: original }), JSON.stringify({ [key]: changed }),
      ]));
      expect(archives()).toHaveLength(2);

      // Existing verified bytes remain usable even when storage cannot grow.
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
      const fullMount = mount();
      try {
        await act(async () => {});
        expect(fullMount.result.current.sessionAutosaveBlocked).toBe(false);
        expect(localStorage.getItem(key)).toBe(changed);
        expect(archives()).toHaveLength(2);
      } finally { fullMount.unmount(); }

      jest.spyOn(Storage.prototype, 'key').mockImplementation(() => { throw new Error('SecurityError'); });
      const unreadableMount = mount();
      try {
        await act(async () => {});
        expect(unreadableMount.result.current.sessionAutosaveBlocked).toBe(true);
        expect(localStorage.getItem(key)).toBe(changed);
        expect(archives()).toHaveLength(2);
      } finally { unreadableMount.unmount(); }
    } finally { jest.restoreAllMocks(); localStorage.clear(); }
  });

  it.each(['parser', 'corrupt JSON', 'invalid shape', 'invalid timestamp'].flatMap(sessionKind =>
    ['success', 'write failure', 'verification failure'].map(archiveResult => [sessionKind, archiveResult])
  ))('preserves %s sessions and saved projects through autosave with archive %s', async (sessionKind, archiveResult) => {
    jest.useFakeTimers();
    localStorage.clear();
    const saved = await ProjectStorage.saveProject('Alice', { Name: { x: 50, y: 50 } }, ['Name'], '/image.png', 'image.png', [{ Name: 'Alice' }]);
    SessionStorage.saveSession({ tableData: [], tableInput: 'Name\n' + 'x'.repeat(2001), useCSVMode: false, isFirstRowHeader: true });
    if (sessionKind === 'invalid timestamp') {
      const session = JSON.parse(localStorage.getItem('bamboobot_current_session_v1')!);
      localStorage.setItem('bamboobot_current_session_v1', JSON.stringify({ ...session, lastModified: 'not-a-date' }));
    } else if (sessionKind !== 'parser') {
      localStorage.setItem('bamboobot_current_session_v1', sessionKind === 'corrupt JSON'
        ? '{"tableInput":"Name\\nRecoverable Bob"'
        : JSON.stringify({ tableInput: 'Name\nRecoverable Bob', tableData: [{ Name: 'Recoverable Bob' }] }));
    }
    const rejectedSession = localStorage.getItem('bamboobot_current_session_v1')!;
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    if (archiveResult === 'write failure') {
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
        if (key.startsWith(QUARANTINE_PREFIX)) throw new Error('QuotaExceededError');
        originalSet.call(this, key, value);
      });
    } else if (archiveResult === 'verification failure') {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
        return key.startsWith(QUARANTINE_PREFIX) ? null : originalGet.call(this, key);
      });
    }
    jest.advanceTimersByTime(1000);
    const { result, unmount } = renderHook(() => {
      const table = useTableData();
      const [positions, setPositions] = useState<Positions>({});
      const [url, setUrl] = useState<string | null>(null);
      const project = useProjectManagement({
        setPositions, setUploadedFileUrl: setUrl, setUploadedFile: () => {}, setEmailConfig: () => {},
        loadSessionData: table.loadSessionData, uploadToServer: async () => undefined,
        showToast: () => {}, manualSave: async () => ({ success: true }),
        uploadedFileUrl: url, uploadedFile: null, positions, emailConfig: {} as EmailConfig,
        tableData: table.tableData, automaticTextColorResult: null,
        clearFile: () => {}, clearPositions: () => {}, clearDragState: () => {}, clearData: table.clearData,
      });
      useProjectAutosave({ positions, columns: Object.keys(table.tableData[0] ?? {}), tableData: table.tableData,
        emailConfig: null, certificateImageUrl: url, certificateFilename: 'image.png',
        enabled: project.hasManuallySaved, currentProjectId: project.currentProjectId, currentProjectName: project.currentProjectName });
      useSessionAutosave({ ...table,
        enabled: project.hasManuallySaved && !project.sessionAutosaveBlocked && table.tableData.length > 0 });
      return { table, project };
    });
    try {
      await act(async () => {});
      await act(async () => { jest.advanceTimersByTime(11_000); });
      expect(result.current.project.currentProjectId).toBe(saved.id);
      expect(ProjectStorage.loadProject(saved.id!)?.tableData).toEqual([{ Name: 'Alice' }]);
      if (archiveResult === 'success') {
        expect(SessionStorage.loadSession()?.tableInput).toBe('Name\nAlice');
        const archive = Object.keys(localStorage).find(key => key.startsWith(QUARANTINE_PREFIX));
        expect(archive).toBeDefined();
        expect(JSON.parse(localStorage.getItem(archive!)!)).toEqual({ bamboobot_current_session_v1: rejectedSession });
      } else {
        expect(localStorage.getItem('bamboobot_current_session_v1')).toBe(rejectedSession);
      }
      // Legacy projects can predate admission bounds. Also exercise rejection
      // during parsing, after structurally valid project data passes admission.
      for (const column of ['x'.repeat(2001), 'Field\t'.repeat(101)]) {
        const legacy = { ...ProjectStorage.loadProject(saved.id!)!, id: 'bob', name: 'Bob',
          positions: { [column]: { x: 12, y: 34 } }, columns: [column], tableData: [{ [column]: 'Bob' }] };
        localStorage.setItem('bamboobot_project_v1_bob', JSON.stringify(legacy));
        await act(async () => { await expect(result.current.project.handleLoadProject(legacy)).rejects.toThrow(); });
        await act(async () => { jest.advanceTimersByTime(11_000); });
        expect(result.current.project.currentProjectId).toBe(saved.id);
        expect(ProjectStorage.loadProject(saved.id!)?.tableData).toEqual([{ Name: 'Alice' }]);
        expect(ProjectStorage.loadProject('bob')?.tableData).toEqual(legacy.tableData);
        expect(ProjectStorage.loadProject(saved.id!)?.positions).toMatchObject({ Name: { x: 50, y: 50 } });
      }
      // A normal JSON import can pass numeric bounds but fail position or asset
      // normalisation. Neither failure may commit its table before rejecting.
      for (const invalid of [
        { positions: { Name: { x: 12, y: 34, color: 123 } } },
        { certificateImage: { url: '/temp_images/u_fixture/bob.png', filename: 123 } },
      ]) {
        const imported = await ProjectStorage.importProject(JSON.stringify({ version: 1, project: {
          ...ProjectStorage.loadProject(saved.id!)!, name: 'Imported Bob', tableData: [{ Name: 'Bob' }], ...invalid,
        } }));
        expect(imported.success).toBe(true);
        const bob = ProjectStorage.loadProject(imported.id!)!;
        await act(async () => { await expect(result.current.project.handleLoadProject(bob)).rejects.toThrow(); });
        await act(async () => { jest.advanceTimersByTime(11_000); });
        expect(result.current.project.currentProjectId).toBe(saved.id);
        expect(ProjectStorage.loadProject(saved.id!)?.tableData).toEqual([{ Name: 'Alice' }]);
        expect(ProjectStorage.loadProject(saved.id!)?.positions).toMatchObject({ Name: { x: 50, y: 50 } });
        expect(ProjectStorage.loadProject(imported.id!)?.tableData).toEqual([{ Name: 'Bob' }]);
        if (archiveResult === 'success') expect(SessionStorage.loadSession()?.tableData).toEqual([{ Name: 'Alice' }]);
        else expect(localStorage.getItem('bamboobot_current_session_v1')).toBe(rejectedSession);
      }
      // A later manual save must not re-enable unsafe session autosave.
      act(() => { result.current.project.handleSaveProjectSuccess(saved.id!, 'Alice'); });
      await act(async () => { jest.advanceTimersByTime(11_000); });
      if (archiveResult !== 'success') expect(localStorage.getItem('bamboobot_current_session_v1')).toBe(rejectedSession);
    } finally { unmount(); jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); }
  });

  it('accepts an initial large edit immediately and never overwrites a newer edit', async () => {
    jest.useFakeTimers();
    const { result, unmount } = renderHook(() => useTableData());
    const pasted = 'Name\n' + Array(101).fill('Alice').join('\n');
    try {
      act(() => { result.current.handleTableDataChange({ target: { value: pasted } } as React.ChangeEvent<HTMLTextAreaElement>); });
      expect(result.current.tableInput).toBe(pasted);
      await act(async () => { result.current.handleTableDataChange({ target: { value: 'Name\nBob' } } as React.ChangeEvent<HTMLTextAreaElement>); });
      await act(async () => { jest.advanceTimersByTime(50); });
      expect(result.current.tableInput).toBe('Name\nBob');
      expect(result.current.tableData).toEqual([{ Name: 'Bob' }]);
    } finally { unmount(); jest.useRealTimers(); }
  });

  it('preserves an already saved project when a paste is rejected', async () => {
    jest.useFakeTimers();
    localStorage.clear();
    const positions = { Name: { x: 50, y: 50 } };
    const saved = await ProjectStorage.saveProject('Accepted', positions, ['Name'], '/image.png', 'image.png', [{ Name: 'Alice' }]);
    const { result, unmount } = renderHook(() => {
      const table = useTableData();
      useProjectAutosave({ positions, columns: Object.keys(table.tableData[0] ?? {}),
        tableData: table.tableData, emailConfig: null, certificateImageUrl: '/image.png',
        certificateFilename: 'image.png', currentProjectId: saved.id, currentProjectName: 'Accepted' });
      return table;
    });
    try {
      await act(async () => { await result.current.loadSessionData('Name\nAlice', false, true); });
      for (const length of [2001, 1_000_001]) {
        await act(async () => { await result.current.handleTableDataChange({ target: { value: 'x'.repeat(length) } } as React.ChangeEvent<HTMLTextAreaElement>); });
        await act(async () => { jest.advanceTimersByTime(11_000); });
        expect(result.current.dataError).toBeTruthy();
        expect(result.current.tableInput).toBe('Name\nAlice');
        expect(ProjectStorage.loadProject(saved.id!)?.tableData).toEqual([{ Name: 'Alice' }]);
      }
    } finally { unmount(); jest.useRealTimers(); localStorage.clear(); }
  });

  it('rejects ragged expansion over the cell budget and recovers on smaller input', async () => {
    const { result } = renderHook(() => useTableData());
    const headers = Array.from({ length: 100 }, (_, i) => `Field${i}`).join('\t');
    await act(async () => {
      await expect(result.current.loadSessionData(headers + '\n' + Array(1001).fill('x').join('\n'), false, true)).rejects.toThrow();
    });
    expect(result.current.tableData).toEqual([]);
    expect(result.current.dataError).toContain('100,000 cells');
    await act(async () => { await result.current.loadSessionData('Name\nAlice', false, true); });
    expect(result.current.tableData).toEqual([{ Name: 'Alice' }]);
    expect(result.current.dataError).toBeNull();
  });

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
      // CSV mode splits on commas only; the tab stays inside the last field.
      expect(result.current.tableData).toEqual([
        { Name: 'John', Email: 'john@example.com', 'Department\tExtra': 'Engineering\tData' },
        { Name: 'Jane', Email: 'jane@example.com', 'Department\tExtra': 'Marketing\tMore' },
      ]);
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

  describe('loadSessionData', () => {
    it('should load session data with explicit settings (no auto-detection)', async () => {
      const { result } = renderHook(() => useTableData());
      
      await act(async () => {
        // Load CSV data but force TSV mode
        const csvData = 'Name,Email,Department\nJohn Doe,john@example.com,Engineering';
        await result.current.loadSessionData(csvData, false, true); // TSV mode, with headers
      });
      
      // Should use TSV mode as specified, not auto-detected CSV
      expect(result.current.useCSVMode).toBe(false);
      expect(result.current.isFirstRowHeader).toBe(true);
      expect(result.current.tableInput).toBe('Name,Email,Department\nJohn Doe,john@example.com,Engineering');
      
      // Data should be parsed as TSV (treating whole line as one column)
      expect(result.current.tableData).toHaveLength(1);
      expect(Object.keys(result.current.tableData[0])).toEqual(['Name,Email,Department']);
    });

    it('should load session data with CSV mode and no headers', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        const csvData = 'John Doe,john@example.com,Engineering\nJane Smith,jane@example.com,Marketing';
        await result.current.loadSessionData(csvData, true, false); // CSV mode, no headers
      });

      expect(result.current.useCSVMode).toBe(true);
      expect(result.current.isFirstRowHeader).toBe(false);
      expect(result.current.tableData).toHaveLength(2);

      // Should use generic column names when no headers
      const firstRow = result.current.tableData[0];
      expect(Object.keys(firstRow)).toEqual(['Column 1', 'Column 2', 'Column 3']);
      expect(firstRow['Column 1']).toBe('John Doe');
      expect(firstRow['Column 2']).toBe('john@example.com');
    });
  });

  describe('CSV Parsing Edge Cases', () => {
    it('should keep a quoted field containing a comma as a single column', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        await result.current.loadSessionData('"Doe, John",42', true, false); // CSV mode, no headers
      });

      const firstRow = result.current.tableData[0];
      expect(Object.keys(firstRow)).toEqual(['Column 1', 'Column 2']);
      expect(firstRow['Column 1']).toBe('Doe, John');
      expect(firstRow['Column 2']).toBe('42');
    });

    it('should preserve RFC-4180 escaped quotes ("") as literal quotes', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        await result.current.loadSessionData('"He said ""hi""",x', true, false); // CSV mode, no headers
      });

      const firstRow = result.current.tableData[0];
      expect(Object.keys(firstRow)).toEqual(['Column 1', 'Column 2']);
      expect(firstRow['Column 1']).toBe('He said "hi"');
      expect(firstRow['Column 2']).toBe('x');
    });

    it('should let duplicate header names collapse to the last column (pinned current behavior)', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        await result.current.loadSessionData('Name,Name\nfirst,second', true, true); // CSV mode, headers
      });

      // Pinned, not endorsed: duplicate headers share one object key, so the
      // last column's value wins and the first column's value is lost.
      expect(result.current.tableData).toHaveLength(1);
      const firstRow = result.current.tableData[0];
      expect(Object.keys(firstRow)).toEqual(['Name']);
      expect(firstRow['Name']).toBe('second');
    });

    it('should drop extra fields and blank missing fields on ragged rows (pinned current behavior)', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        const raggedCsv = 'Name,Email,Department\nJohn,john@example.com,Engineering,EXTRA\nJane,jane@example.com';
        await result.current.loadSessionData(raggedCsv, true, true); // CSV mode, headers
      });

      expect(result.current.tableData).toHaveLength(2);

      // Pinned: fields beyond the header count are silently dropped
      const longRow = result.current.tableData[0];
      expect(Object.keys(longRow)).toEqual(['Name', 'Email', 'Department']);
      expect(longRow).toEqual({
        Name: 'John',
        Email: 'john@example.com',
        Department: 'Engineering'
      });

      // Pinned: missing trailing fields become empty strings
      const shortRow = result.current.tableData[1];
      expect(shortRow).toEqual({
        Name: 'Jane',
        Email: 'jane@example.com',
        Department: ''
      });
    });

    it('should fall back to _column_N for blank header cells', async () => {
      const { result } = renderHook(() => useTableData());

      await act(async () => {
        await result.current.loadSessionData('Name,,Email\nJohn,middle,john@example.com', true, true); // CSV mode, headers
      });

      expect(result.current.tableData).toHaveLength(1);
      const firstRow = result.current.tableData[0];
      expect(Object.keys(firstRow)).toEqual(['Name', '_column_1', 'Email']);
      expect(firstRow['_column_1']).toBe('middle');
    });

    it('should clear table data for empty and whitespace-only input', async () => {
      const { result } = renderHook(() => useTableData());

      // Seed with real data first
      await act(async () => {
        const event = {
          target: { value: 'Name,Email\nJohn,john@example.com' }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        await result.current.handleTableDataChange(event);
      });
      expect(result.current.tableData).toHaveLength(1);

      // Whitespace-only input clears the parsed data
      await act(async () => {
        const event = {
          target: { value: '   \n\t ' }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        await result.current.handleTableDataChange(event);
      });
      expect(result.current.tableData).toEqual([]);
      expect(result.current.detectedEmailColumn).toBeNull();

      // Re-seed, then fully empty input clears it too
      await act(async () => {
        const event = {
          target: { value: 'Name,Email\nJohn,john@example.com' }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        await result.current.handleTableDataChange(event);
      });
      expect(result.current.tableData).toHaveLength(1);

      await act(async () => {
        const event = {
          target: { value: '' }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        await result.current.handleTableDataChange(event);
      });
      expect(result.current.tableData).toEqual([]);
      expect(result.current.detectedEmailColumn).toBeNull();
    });
  });
});
