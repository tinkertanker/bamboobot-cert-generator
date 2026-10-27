import { SessionStorage } from '@/lib/session-storage';
import type { SessionData } from '@/lib/session-storage';
import { OWNER_KEY, QUARANTINE_PREFIX, guardLocalStorageForUser } from '@/lib/storage/account-scope';
import { installMockLocalStorage } from '../helpers/mock-local-storage';
import { silenceConsole } from '../helpers/silence-console';

const mockLocalStorage = installMockLocalStorage();

describe('SessionStorage', () => {
  silenceConsole();

  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
  });

  it('binds new recovery copies to their account without adopting identical unknown archives', () => {
    const key = 'bamboobot_current_session_v1';
    const original = '{"tableInput":"Alice\\n\ud800"';
    const legacyKey = `${QUARANTINE_PREFIX}legacy`;
    const legacy = JSON.stringify({ [key]: original });
    mockLocalStorage.store[legacyKey] = legacy;
    guardLocalStorageForUser('alice');
    mockLocalStorage.store[key] = original;

    expect(SessionStorage.archiveSession('alice')).toBe(true);
    const copies = SessionStorage.listRecoverySessions('alice');
    expect(copies).toHaveLength(1);
    expect(SessionStorage.readRecoverySession(copies[0], 'alice')).toBe(original);
    expect(mockLocalStorage.store[legacyKey]).toBe(legacy);
    expect(() => SessionStorage.readRecoverySession(legacyKey, 'alice')).toThrow();

    expect(SessionStorage.archiveSession('alice')).toBe(true);
    expect(SessionStorage.listRecoverySessions('alice')).toEqual(copies);
    mockLocalStorage.store[key] = original + ' changed';
    expect(SessionStorage.archiveSession('alice')).toBe(true);
    expect(SessionStorage.listRecoverySessions('alice')).toHaveLength(2);

    guardLocalStorageForUser('bob');
    expect(SessionStorage.listRecoverySessions('bob')).toEqual([]);
    expect(() => SessionStorage.readRecoverySession(copies[0], 'bob')).toThrow();
    expect(() => SessionStorage.listRecoverySessions('alice')).toThrow();
    expect(SessionStorage.archiveSession('alice')).toBe(false);
    guardLocalStorageForUser('alice');
    expect(SessionStorage.readRecoverySession(copies[0], 'alice')).toBe(original);
  });

  it('fails closed on storage errors but reuses exact owned bytes when storage is full', () => {
    const key = 'bamboobot_current_session_v1';
    mockLocalStorage.store[OWNER_KEY] = 'alice';
    mockLocalStorage.store[key] = 'rejected bytes';
    expect(SessionStorage.archiveSession('alice')).toBe(true);
    mockLocalStorage.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    expect(SessionStorage.archiveSession('alice')).toBe(true);
    mockLocalStorage.store[key] = 'different rejected bytes';
    expect(SessionStorage.archiveSession('alice')).toBe(false);
    expect(mockLocalStorage.store[key]).toBe('different rejected bytes');
    mockLocalStorage.key.mockImplementationOnce(() => { throw new Error('SecurityError'); });
    expect(SessionStorage.archiveSession('alice')).toBe(false);
    mockLocalStorage.key.mockImplementationOnce(() => { throw new Error('SecurityError'); });
    expect(() => SessionStorage.listRecoverySessions('alice')).toThrow();
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

  it('returns null age for a corrupted lastModified timestamp', () => {
    // Regression: a garbage timestamp used to produce NaN, which callers
    // comparing against null treated as a valid age.
    mockLocalStorage.store['bamboobot_current_session_v1'] = JSON.stringify({
      tableData: [],
      tableInput: '',
      isFirstRowHeader: false,
      useCSVMode: false,
      lastModified: 'not-a-date'
    });

    expect(SessionStorage.getSessionAge()).toBeNull();
  });

  it('rejects well-formed JSON with the wrong shape', () => {
    for (const bad of [
      'null',
      '"a string"',
      '{"tableData":{}}',
      '{"tableData":"rows"}',
      '{}',
      '{"tableData":[]}',
      '{"tableData":[],"tableInput":1,"isFirstRowHeader":"false","useCSVMode":null,"lastModified":{}}'
    ]) {
      mockLocalStorage.store['bamboobot_current_session_v1'] = bad;
      expect(SessionStorage.loadSession()).toBeNull();
    }
  });

  it('returns false when localStorage.setItem throws', () => {
    mockLocalStorage.setItem.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });

    const result = SessionStorage.saveSession({
      tableData: [],
      tableInput: '',
      isFirstRowHeader: false,
      useCSVMode: false
    });

    expect(result).toBe(false);
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
