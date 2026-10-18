// Jest stand-in for the ESM-only @opennextjs/cloudflare package. There is no
// OpenNext request context in tests, so getEnv() falls back to the env that a
// test registers with setWorkerEnv() (see __tests__/helpers/cloudflare.ts).
export function getCloudflareContext(): never {
  throw new Error('No Cloudflare context in tests');
}

export function initOpenNextCloudflareForDev(): void {}

export function defineCloudflareConfig<T>(config: T): T {
  return config;
}
