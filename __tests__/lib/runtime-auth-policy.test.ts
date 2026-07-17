import { isAuthenticationRequired } from '@/lib/auth/runtime-policy';

describe('isAuthenticationRequired', () => {
  const originalRequireAuth = process.env.REQUIRE_AUTH;
  const originalNodeEnv = process.env.NODE_ENV;

  function setNodeEnv(value: string): void {
    Object.defineProperty(process.env, 'NODE_ENV', {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }

  afterEach(() => {
    if (originalRequireAuth === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = originalRequireAuth;
    setNodeEnv(originalNodeEnv ?? 'test');
    delete process.env.NEXT_PUBLIC_REQUIRE_AUTH;
  });

  it('defaults to enabled in production', () => {
    delete process.env.REQUIRE_AUTH;
    setNodeEnv('production');

    expect(isAuthenticationRequired()).toBe(true);
  });

  it.each(['development', 'test'])('defaults to disabled in %s', nodeEnv => {
    delete process.env.REQUIRE_AUTH;
    setNodeEnv(nodeEnv);

    expect(isAuthenticationRequired()).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', ' yes ', 'on'])('accepts enabled value %p', value => {
    process.env.REQUIRE_AUTH = value;
    expect(isAuthenticationRequired()).toBe(true);
  });

  it.each(['0', 'false', 'FALSE', ' no ', 'off'])('accepts disabled value %p', value => {
    process.env.REQUIRE_AUTH = value;
    expect(isAuthenticationRequired()).toBe(false);
  });

  it('treats a whitespace-only value as unset and applies the environment default', () => {
    process.env.REQUIRE_AUTH = '   ';
    setNodeEnv('production');
    expect(isAuthenticationRequired()).toBe(true);

    setNodeEnv('development');
    expect(isAuthenticationRequired()).toBe(false);
  });

  it('fails closed for an invalid value', () => {
    process.env.REQUIRE_AUTH = 'maybe';
    setNodeEnv('development');

    expect(isAuthenticationRequired()).toBe(true);
  });

  it('reads the setting on every call', () => {
    process.env.REQUIRE_AUTH = 'false';
    expect(isAuthenticationRequired()).toBe(false);

    process.env.REQUIRE_AUTH = 'true';
    expect(isAuthenticationRequired()).toBe(true);
  });

  it('ignores the former public build-time setting', () => {
    delete process.env.REQUIRE_AUTH;
    setNodeEnv('production');
    process.env.NEXT_PUBLIC_REQUIRE_AUTH = 'false';

    expect(isAuthenticationRequired()).toBe(true);
  });
});
