type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

/**
 * Silences the given console methods for every test in the enclosing scope.
 * Use in suites that deliberately drive error/retry paths whose source code logs.
 * Tests can still assert on the output via `expect(console.error).toHaveBeenCalled...`.
 */
export function silenceConsole(methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error']): void {
  let spies: jest.SpyInstance[] = [];
  beforeEach(() => {
    spies = methods.map(method => jest.spyOn(console, method).mockImplementation(() => {}));
  });
  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
  });
}
