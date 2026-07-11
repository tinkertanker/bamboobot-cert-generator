function getLegacyTempImagePath(value: string): string | null {
  let pathname = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      pathname = new URL(value).pathname;
    } catch {
      return null;
    }
  }

  const match = pathname.match(/(?:^|\/)temp_images\/(u_[^/]+\/.+)$/);
  if (!match) return null;
  const privatePath = match[1];
  const segments = privatePath.split('/');
  if (
    privatePath.includes('\\') ||
    segments.some(segment => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  return privatePath;
}

export function normalizeLegacyPrivateAssetUrl(value: string): string {
  const privatePath = getLegacyTempImagePath(value);
  if (privatePath) return `/api/files/temp_images/${privatePath}`;
  return value;
}

export function normalizeLegacyPrivateAssetReference(
  url: string,
  filename: string,
): { url: string; filename: string } {
  const privatePath = getLegacyTempImagePath(url);
  const userNamespace = privatePath?.split('/')[0];
  const scopedFilename = userNamespace && !filename.includes('/')
    ? `${userNamespace}/${filename}`
    : filename;
  return {
    url: normalizeLegacyPrivateAssetUrl(url),
    filename: scopedFilename,
  };
}
