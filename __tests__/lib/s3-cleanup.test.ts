import { silenceConsole } from '../helpers/silence-console';

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
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

import { cleanupExpiredS3Files } from '@/lib/s3-client';

type Cmd = { name: string; input: { Key?: string; ContinuationToken?: string } };

const day = 24 * 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

// S3 returns custom metadata keys lowercased.
const objects: Record<string, Record<string, string>> = {
  'generated/preview_old.pdf': { type: 'preview', created: ago(2 * day), retention: '24h' },
  'generated/certificates_new.pdf': { type: 'bulk', created: ago(day), retention: '7d' },
  'generated/individual_1/cert.pdf': { type: 'individual', created: ago(100 * day), retention: '90d', emailsent: 'true' },
  'generated/individual_2/cert.pdf': { type: 'individual', created: ago(100 * day), retention: '90d', emailsent: 'false' },
  'temp_images/u_1/bg.png': { type: 'template', created: ago(400 * day), retention: 'permanent' },
};

function respond(cmd: Cmd) {
  if (cmd.name === 'List') {
    // Two pages, to check the cleanup follows pagination.
    const keys = Object.keys(objects);
    return cmd.input.ContinuationToken
      ? { Contents: keys.slice(2).map(Key => ({ Key })) }
      : { Contents: keys.slice(0, 2).map(Key => ({ Key })), NextContinuationToken: 'page-2' };
  }
  if (cmd.name === 'Head') return { Metadata: objects[cmd.input.Key as string] };
  if (cmd.name === 'Delete') return {};
  throw new Error(`unexpected ${cmd.name}`);
}

describe('cleanupExpiredS3Files', () => {
  silenceConsole();

  beforeEach(() => {
    send.mockReset();
    send.mockImplementation(async (cmd: Cmd) => respond(cmd));
  });

  const deletedKeys = () =>
    send.mock.calls.map(([c]) => c as Cmd).filter(c => c.name === 'Delete').map(c => c.input.Key);

  it('deletes expired objects across every listing page', async () => {
    const result = await cleanupExpiredS3Files();

    expect(result.deleted).toEqual(['generated/preview_old.pdf', 'generated/individual_2/cert.pdf']);
    expect(result.errors).toEqual([]);
    expect(deletedKeys()).toEqual(expect.arrayContaining(result.deleted));
    expect(deletedKeys()).toHaveLength(2);
  });

  it('reports but does not delete on a dry run', async () => {
    const result = await cleanupExpiredS3Files({ dryRun: true });

    expect(result.deleted).toEqual(['generated/preview_old.pdf', 'generated/individual_2/cert.pdf']);
    expect(deletedKeys()).toEqual([]);
  });

  it('skips objects that no longer exist', async () => {
    send.mockImplementation(async (cmd: Cmd) => {
      if (cmd.name === 'Head' && cmd.input.Key === 'generated/preview_old.pdf') {
        throw Object.assign(new Error('Not Found'), { name: 'NotFound' });
      }
      return respond(cmd);
    });

    const result = await cleanupExpiredS3Files();

    expect(result.deleted).toEqual(['generated/individual_2/cert.pdf']);
    expect(result.errors).toEqual([]);
  });

  it('reports objects whose metadata cannot be read as errors', async () => {
    send.mockImplementation(async (cmd: Cmd) => {
      if (cmd.name === 'Head' && cmd.input.Key === 'generated/preview_old.pdf') {
        throw Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
      }
      return respond(cmd);
    });

    const result = await cleanupExpiredS3Files();

    expect(result.deleted).toEqual(['generated/individual_2/cert.pdf']);
    expect(result.errors).toEqual(['generated/preview_old.pdf']);
  });

  it('throws when the bucket cannot be listed', async () => {
    send.mockRejectedValue(new Error('AccessDenied'));
    await expect(cleanupExpiredS3Files()).rejects.toThrow('AccessDenied');
  });
});
