const REFUND_SAFE_PREFIXES = ['PROVIDER_BUSY:', 'PROVIDER_CAPACITY:', 'PROVIDER_REJECTED:'] as const;

export function providerRejectedError(message: string): string {
  return `PROVIDER_REJECTED: ${message}`;
}

/** True only when the provider definitively did not accept the message. */
export function isDefinitelyUnsentProviderError(error?: string): boolean {
  return !!error && REFUND_SAFE_PREFIXES.some(prefix => error.startsWith(prefix));
}

export function isProviderBackpressureError(error?: string): boolean {
  return !!error && (error.startsWith('PROVIDER_BUSY:') || error.startsWith('PROVIDER_CAPACITY:'));
}

export function providerRetryAfterSeconds(error?: string): number {
  const milliseconds = error?.match(/retry after\s+(\d+)ms/i)?.[1];
  if (!milliseconds) return 1;
  return Math.min(120, Math.max(1, Math.ceil(Number(milliseconds) / 1000)));
}

export function publicProviderError(error?: string): string {
  if (isProviderBackpressureError(error)) {
    return 'Email service is temporarily busy. Please retry shortly.';
  }
  if (error?.startsWith('PROVIDER_REJECTED:')) {
    return 'The email provider rejected the message. Check the sender and recipient configuration.';
  }
  return 'Email delivery could not be confirmed. It was not retried to avoid duplicate delivery.';
}
