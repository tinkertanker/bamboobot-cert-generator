export function sanitizePdfBaseFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function getPdfBaseFilename(value: unknown, fallback: string): string {
  const candidate =
    value && typeof value === 'object' && 'text' in value
      ? (value as { text?: unknown }).text
      : value;
  if (
    candidate === null ||
    candidate === undefined ||
    (typeof candidate === 'object')
  ) {
    return fallback;
  }
  const stringValue = String(candidate);
  return stringValue.length > 0 ? stringValue : fallback;
}

export class UniquePdfFilenameAllocator {
  private readonly used = new Set<string>();
  private readonly nextSuffix = new Map<string, number>();

  allocate(baseFilename: string): string {
    // An empty base would yield an extension-only filename ('.pdf'), so fall back
    const sanitizedBase = sanitizePdfBaseFilename(baseFilename) || 'certificate';
    const initial = `${sanitizedBase}.pdf`;
    if (!this.used.has(initial)) {
      this.used.add(initial);
      return initial;
    }

    let suffix = this.nextSuffix.get(sanitizedBase) || 1;
    let candidate = `${sanitizedBase}-${suffix}.pdf`;
    while (this.used.has(candidate)) {
      suffix += 1;
      candidate = `${sanitizedBase}-${suffix}.pdf`;
    }
    this.nextSuffix.set(sanitizedBase, suffix + 1);
    this.used.add(candidate);
    return candidate;
  }
}
