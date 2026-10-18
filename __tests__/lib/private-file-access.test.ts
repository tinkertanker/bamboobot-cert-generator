/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import {
  getAuthorizedTemplateSource,
  loadAuthorizedTemplate,
  MAX_TEMPLATE_BYTES,
  PrivateFileAccessError,
} from '@/lib/security/private-file-access';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

describe('private template access', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetCloudflareEnv();
  });

  it('confines templates to the current user namespace', () => {
    expect(getAuthorizedTemplateSource('u_user-1/template.pdf', 'user-1'))
      .toEqual({ kind: 'object', key: 'temp_images/u_user-1/template.pdf' });
    expect(() => getAuthorizedTemplateSource('u_victim/template.pdf', 'attacker'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateSource('u_user-1/../../secret.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(() => getAuthorizedTemplateSource('u_user-1/../u_victim/secret.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
  });

  it('rejects namespace-directory, null-byte, backslash, and non-normalized paths', () => {
    for (const value of [
      'u_user-1/',
      'u_user-1/template.pdf/',
      'u_user-1/tem\0plate.pdf',
      'u_user-1\\template.pdf',
      'u_user-1/./template.pdf',
      'u_user-1//template.pdf',
      '',
      undefined as unknown as string,
    ]) {
      expect(() => getAuthorizedTemplateSource(value, 'user-1')).toThrow(PrivateFileAccessError);
    }
  });

  it('does not authorize a sibling user whose id is a prefix of the owner', () => {
    expect(() => getAuthorizedTemplateSource('u_user-12/template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
    expect(getAuthorizedTemplateSource('u_user-12/template.pdf', 'user-12'))
      .toEqual({ kind: 'object', key: 'temp_images/u_user-12/template.pdf' });
  });

  it('allows only the bundled development template outside a user namespace', () => {
    expect(getAuthorizedTemplateSource('dev-mode-template.pdf', 'user-1'))
      .toEqual({ kind: 'asset', path: '/template_images/dev-mode-template.pdf' });
    expect(() => getAuthorizedTemplateSource('other-template.pdf', 'user-1'))
      .toThrow(PrivateFileAccessError);
  });

  it("loads the user's template from R2 and the dev template from static assets", async () => {
    bucket.seed('temp_images/u_user-1/template.pdf', '%PDF-1.4 mine');

    const own = await loadAuthorizedTemplate('u_user-1/template.pdf', 'user-1');
    expect(Buffer.from(own as Uint8Array).toString()).toBe('%PDF-1.4 mine');

    const dev = await loadAuthorizedTemplate('dev-mode-template.pdf', 'user-1');
    expect(Buffer.from(dev as Uint8Array).subarray(0, 5).toString()).toBe('%PDF-');

    await expect(loadAuthorizedTemplate('u_user-1/missing.pdf', 'user-1')).resolves.toBeNull();
  });

  it('refuses to load an oversized template', async () => {
    bucket.seed('temp_images/u_user-1/huge.pdf', new Uint8Array(MAX_TEMPLATE_BYTES + 1));

    await expect(loadAuthorizedTemplate('u_user-1/huge.pdf', 'user-1'))
      .rejects.toMatchObject({ name: 'PrivateFileAccessError', statusCode: 413 });
  });

  it('never reads storage for an unauthorised template', async () => {
    const get = jest.spyOn(bucket, 'get');
    await expect(loadAuthorizedTemplate('u_victim/template.pdf', 'attacker')).rejects.toBeInstanceOf(PrivateFileAccessError);
    expect(get).not.toHaveBeenCalled();
  });
});
