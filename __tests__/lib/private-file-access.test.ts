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

  it('allows only the bundled development template outside a user namespace', () => {
    expect(getAuthorizedTemplateCandidates('dev-mode-template.pdf', 'user-1')[0])
      .toContain(path.join('public', 'template_images', 'dev-mode-template.pdf'));
    expect(() => getAuthorizedTemplateCandidates('other-template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
  });
});
