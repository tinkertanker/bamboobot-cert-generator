const isProd = process.env.NODE_ENV === 'production';

export function debug(...args: unknown[]) {
  if (!isProd) console.log(...args);
}

// Always surface errors
export function error(...args: unknown[]) {
  console.error(...args);
}

