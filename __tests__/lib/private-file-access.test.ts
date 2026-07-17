import path from 'path';
import {
  getAuthorizedTemplateCandidates,
  PrivateFileAccessError,
} from '@/lib/security/private-file-access';

describe('private template access', () => {
  it('confines templates to the current user namespace', () => {
    expect(getAuthorizedTemplateCandidates('u_user-1/template.pdf', 'user-1'))
      .toEqual(expect.arrayContaining([
        expect.stringContaining(path.join('temp_images', 'u_user-1', 'template.pdf')),
      ]));
    expect(() => getAuthorizedTemplateCandidates('u_victim/template.pdf', 'attacker'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1/../../secret.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1/../u_victim/secret.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
  });

  it('rejects namespace-directory, null-byte, backslash, and non-normalized paths', () => {
    // Regression: a trailing slash used to resolve to the user's whole
    // namespace directory, and null bytes reached the filesystem layer.
    expect(() => getAuthorizedTemplateCandidates('u_user-1/', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1/template.pdf/', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1/tem\0plate.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1\\template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('u_user-1/./template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates('', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateCandidates(undefined as unknown as string, 'user-1'))
      .toThrow(PrivateFileAccessError);
  });

  it('does not authorize a sibling user whose id is a prefix of the owner', () => {
    expect(() => getAuthorizedTemplateCandidates('u_user-12/template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(getAuthorizedTemplateCandidates('u_user-12/template.pdf', 'user-12').length)
      .toBeGreaterThan(0);
  });

  it('allows only the bundled development template outside a user namespace', () => {
    expect(getAuthorizedTemplateCandidates('dev-mode-template.pdf', 'user-1')[0])
      .toContain(path.join('public', 'template_images', 'dev-mode-template.pdf'));
    expect(() => getAuthorizedTemplateCandidates('other-template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
  });
});
