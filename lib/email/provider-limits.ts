export function getSendTimeoutMs(): number {
  const configured = Number.parseInt(process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return 30_000;
  return Math.min(configured, 120_000);
}

export function getMaxPendingSends(): number {
  const configured = Number.parseInt(process.env.MAX_PENDING_EMAIL_PROVIDER_SENDS || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return 8;
  return Math.min(configured, 100);
}
