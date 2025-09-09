const isProd = process.env.NODE_ENV === 'production';

export function debug(...args: unknown[]) {
  if (!isProd) console.log(...args);
}

export function info(...args: unknown[]) {
  if (!isProd) console.log(...args);
}

export function warn(...args: unknown[]) {
  if (!isProd) console.warn(...args);
}

// Always surface errors
export function error(...args: unknown[]) {
  console.error(...args);
}

