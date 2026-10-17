// Upload metadata decides lifecycle deletion, so check the real classifiers
// in uploadToR2 and uploadToS3 rather than a copy of their logic.
const send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const command = (name: string) =>
    jest.fn().mockImplementation((input: unknown) => ({ name, input }));
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: (cmd: unknown) => send(cmd) })),
    PutObjectCommand: command('Put'),
    GetObjectCommand: command('Get'),
    DeleteObjectCommand: command('Delete'),
    ListObjectsV2Command: command('List'),
    HeadObjectCommand: command('Head'),
  };
});
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn(async () => 'https://signed') }));

import { uploadToR2 } from '@/lib/r2-client';
import { uploadToS3 } from '@/lib/s3-client';

type PutCmd = { name: string; input: { Key: string; Metadata: Record<string, string> } };

function sentMetadata(): Record<string, string> {
  const put = send.mock.calls.map(([c]) => c as PutCmd).find((c) => c.name === 'Put');
  if (!put) throw new Error('no PutObjectCommand sent');
  return put.input.Metadata;
}

const cases = [
  ['generated/individual_123/cert.pdf', 'individual', '90d'],
  ['generated/certificates_123.pdf', 'bulk', '7d'],
  ['generated/preview_abc.pdf', 'preview', '24h'],
  ['temp_images/template.png', 'template', 'permanent'],
] as const;

describe.each([
  ['uploadToR2', uploadToR2],
  ['uploadToS3', uploadToS3],
])('%s metadata', (_name, upload) => {
  beforeEach(() => send.mockReset());

  it.each(cases)('classifies %s as %s with %s retention', async (key, type, retention) => {
    await upload(Buffer.from('x'), key, 'application/pdf');
    expect(sentMetadata()).toMatchObject({ type, retention, emailSent: 'false' });
  });

  it('lets caller-supplied metadata override the key-based defaults', async () => {
    await upload(Buffer.from('x'), 'generated/preview_abc.pdf', 'application/pdf', undefined, {
      type: 'individual',
      retention: '90d',
    });
    expect(sentMetadata()).toMatchObject({ type: 'individual', retention: '90d' });
  });
});
