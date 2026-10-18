/** @jest-environment node */
// Object metadata decides lifecycle deletion, so check the real key-based
// classifier in putObject rather than a copy of its logic.
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import { putObject } from '@/lib/storage/bucket';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const cases = [
  ['generated/u_1/individual_123/cert.pdf', 'individual', '90d'],
  ['generated/u_1/certificates_123.pdf', 'bulk', '7d'],
  ['generated/u_1/preview_abc.pdf', 'preview', '24h'],
  ['email_queue/u_1/session/item/0.pdf', 'preview', '7d'],
  ['temp_images/u_1/template.png', 'template', 'permanent'],
] as const;

describe('putObject retention metadata', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => resetCloudflareEnv());

  it.each(cases)('classifies %s as %s with %s retention', async (key, type, retention) => {
    await putObject(key, Buffer.from('x'), { contentType: 'application/pdf' });
    expect(bucket.objects.get(key)?.customMetadata).toMatchObject({ type, retention, emailsent: 'false' });
  });

  it('lets caller-supplied metadata override the key-based defaults', async () => {
    await putObject('generated/u_1/preview_abc.pdf', Buffer.from('x'), {
      metadata: { type: 'individual', retention: '90d' },
    });
    expect(bucket.objects.get('generated/u_1/preview_abc.pdf')?.customMetadata)
      .toMatchObject({ type: 'individual', retention: '90d' });
  });
});
