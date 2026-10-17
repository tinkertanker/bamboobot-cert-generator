/**
 * In-memory localStorage replacement with jest.fn spies, installed on `window`.
 * `store` is exposed so tests can seed or inspect raw values directly.
 */
export function installMockLocalStorage() {
  const mock = {
    store: {} as Record<string, string>,
    getItem: jest.fn((key: string): string | null => mock.store[key] ?? null),
    setItem: jest.fn((key: string, value: string): void => {
      mock.store[key] = value;
    }),
    removeItem: jest.fn((key: string): void => {
      delete mock.store[key];
    }),
    clear: jest.fn((): void => {
      mock.store = {};
    }),
    key: jest.fn((index: number): string | null => Object.keys(mock.store)[index] ?? null),
    get length(): number {
      return Object.keys(mock.store).length;
    },
  };

  Object.defineProperty(window, 'localStorage', { value: mock, writable: true });
  return mock;
}
