import { renderHook } from '@testing-library/react';
import { useDevMode } from '@/hooks/useDevMode';

type DevModeProps = Parameters<typeof useDevMode>[0];

// Exercises the dev-mode email test-data generator through the hook's public API:
// handleEmailTemplateUpdate passes the generated CSV to loadPresetData.
function generate(baseEmail: string, numTestEmails: number) {
  const loadPresetData = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
  const props: DevModeProps = {
    isDevelopment: true,
    devMode: true,
    setDevMode: jest.fn(),
    baseEmail,
    numTestEmails,
    loadPresetData,
    clearData: jest.fn(),
    clearFile: jest.fn(),
    clearPositions: jest.fn(),
    clearPdfData: jest.fn(),
    setUploadedFileUrl: jest.fn(),
    setUploadedFile: jest.fn(),
    setEmailConfig: jest.fn(),
  };
  const { result } = renderHook(() => useDevMode(props));
  result.current.handleEmailTemplateUpdate();
  expect(loadPresetData).toHaveBeenCalledTimes(1);
  return { csv: loadPresetData.mock.calls[0][0], presetCSVData: result.current.presetCSVData };
}

describe('useDevMode email test data', () => {
  it('generates plus-addressed emails for each row', () => {
    const lines = generate('test@gmail.com', 3).csv.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Name,Department,Email');
    expect(lines.slice(1).map(line => line.split(',')[2])).toEqual([
      'test+1@gmail.com',
      'test+2@gmail.com',
      'test+3@gmail.com',
    ]);
  });

  it('works with any email domain', () => {
    const lines = generate('user@example.org', 2).csv.split('\n');

    expect(lines[1]).toContain('user+1@example.org');
    expect(lines[2]).toContain('user+2@example.org');
  });

  it('falls back to the preset data for an invalid email', () => {
    const { csv, presetCSVData } = generate('invalid-email', 5);

    expect(presetCSVData).not.toBe('');
    expect(csv).toBe(presetCSVData);
  });

  it('cycles names once the list is exhausted', () => {
    const names = generate('test@gmail.com', 21)
      .csv.split('\n')
      .slice(1)
      .map(line => line.split(',')[0]);

    expect(new Set(names.slice(0, 20)).size).toBe(20);
    expect(names[20]).toBe(names[0]);
  });
});
