import { SessionStorage } from '@/lib/session-storage';
import type { SessionData } from '@/lib/session-storage';

// Mock localStorage
const mockLocalStorage = {
  store: {} as Record<string, string>,
  getItem: jest.fn((key: string) => mockLocalStorage.store[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorage.store[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorage.store[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorage.store = {};
  }),
  key: jest.fn((index: number) => {
    const keys = Object.keys(mockLocalStorage.store);
    return keys[index] || null;
  }),
  get length() {
    return Object.keys(mockLocalStorage.store).length;
  }
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('SessionStorage', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  it('saves session data successfully', () => {
    const sessionData = {
      tableData: [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' }
      ],
      tableInput: 'name\temail\nJohn Doe\tjohn@example.com\nJane Smith\tjane@example.com',
      isFirstRowHeader: true,
      useCSVMode: false
    };

    const result = SessionStorage.saveSession(sessionData);
    
    expect(result).toBe(true);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'bamboobot_current_session_v1',
      expect.any(String)
    );
    
    const savedData = JSON.parse(mockLocalStorage.store['bamboobot_current_session_v1']);
    expect(savedData.tableData).toEqual(sessionData.tableData);
    expect(savedData.lastModified).toBeDefined();
  });

  it('loads session data successfully', () => {
    const sessionData: SessionData = {
      tableData: [{ name: 'Test' }],
      tableInput: 'name\nTest',
      isFirstRowHeader: true,
      useCSVMode: false,
      lastModified: new Date().toISOString()
    };

    mockLocalStorage.store['bamboobot_current_session_v1'] = JSON.stringify(sessionData);

    const loaded = SessionStorage.loadSession();
    
    expect(loaded).not.toBeNull();
    expect(loaded?.tableData).toEqual(sessionData.tableData);
    expect(loaded?.tableInput).toBe(sessionData.tableInput);
  });

  it('returns null when no session exists', () => {
    const loaded = SessionStorage.loadSession();
    expect(loaded).toBeNull();
  });

  it('handles corrupted session data', () => {
    mockLocalStorage.store['bamboobot_current_session_v1'] = 'invalid json';
    
    const loaded = SessionStorage.loadSession();
    expect(loaded).toBeNull();
  });

  it('clears session data', () => {
    mockLocalStorage.store['bamboobot_current_session_v1'] = JSON.stringify({ tableData: [] });
    
    SessionStorage.clearSession();
    
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('bamboobot_current_session_v1');
  });

  it('calculates session age correctly', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sessionData: SessionData = {
      tableData: [],
      tableInput: '',
      isFirstRowHeader: false,
      useCSVMode: false,
      lastModified: oneHourAgo
    };

    mockLocalStorage.store['bamboobot_current_session_v1'] = JSON.stringify(sessionData);

    const age = SessionStorage.getSessionAge();
    
    expect(age).not.toBeNull();
    expect(age).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000); // Allow 1 second tolerance
    expect(age).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
  });

  it('rejects data exceeding size limit', () => {
    // Create large data that exceeds 2MB
    const largeData = {
      tableData: Array(10000).fill(null).map((_, i) => ({
        field1: 'x'.repeat(100),
        field2: 'y'.repeat(100),
        field3: 'z'.repeat(100)
      })),
      tableInput: 'x'.repeat(1000000),
      isFirstRowHeader: true,
      useCSVMode: false
    };

    const result = SessionStorage.saveSession(largeData);
    
    expect(result).toBe(false);
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
  });
});