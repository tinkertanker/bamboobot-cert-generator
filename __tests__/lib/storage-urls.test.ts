import {
  normalizeLegacyPrivateAssetReference,
  normalizeLegacyPrivateAssetUrl,
} from '@/lib/storage-urls';

describe('legacy private asset URLs', () => {
  it('routes saved temporary-image URLs through the authenticated API', () => {
    expect(normalizeLegacyPrivateAssetUrl('/temp_images/u_user/template.jpg'))
      .toBe('/api/files/temp_images/u_user/template.jpg');
  });

  it('scopes the legacy PDF filename alongside its saved image URL', () => {
    expect(normalizeLegacyPrivateAssetReference(
      '/temp_images/u_user/template.jpg',
      'template.pdf',
    )).toEqual({
      url: '/api/files/temp_images/u_user/template.jpg',
      filename: 'u_user/template.pdf',
    });
  });

  it('normalizes legacy absolute cloud URLs and their PDF filename', () => {
    expect(normalizeLegacyPrivateAssetReference(
      'https://certs.example.com/bucket/temp_images/u_user/template.jpg?signature=old',
      'template.pdf',
    )).toEqual({
      url: '/api/files/temp_images/u_user/template.jpg',
      filename: 'u_user/template.pdf',
    });
  });

  it('does not normalize malformed traversal-like cloud paths', () => {
    expect(normalizeLegacyPrivateAssetUrl(
      'https://certs.example.com/temp_images/u_user/../secret.pdf',
    )).toBe('https://certs.example.com/temp_images/u_user/../secret.pdf');
  });

  it('does not rewrite unrelated or bundled public assets', () => {
    expect(normalizeLegacyPrivateAssetUrl('/template_images/dev-mode-template.jpg'))
      .toBe('/template_images/dev-mode-template.jpg');
    expect(normalizeLegacyPrivateAssetUrl('blob:local')).toBe('blob:local');
  });
});
