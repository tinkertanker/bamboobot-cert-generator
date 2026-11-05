import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/cleanup-r2';
import { silenceConsole } from '../helpers/silence-console';

// The shared handler's auth, method and error contract is covered in
// cleanup-s3.test.ts; this file only checks the R2 wiring.
jest.mock('../../lib/r2-client', () => ({
  isR2Configured: jest.fn(),
  cleanupExpiredFiles: jest.fn(),
}));

const { isR2Configured, cleanupExpiredFiles } = require('../../lib/r2-client');

describe('/api/cleanup-r2', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';
  });

  afterEach(() => {
    delete process.env.CLEANUP_SECRET_KEY;
  });

  it('reports R2 as unconfigured without running cleanup', async () => {
    isR2Configured.mockReturnValue(false);
    const { req, res } = createMocks({ method: 'POST', headers: { 'x-cleanup-key': 'super-secret-key' } });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'R2 storage is not configured' });
    expect(cleanupExpiredFiles).not.toHaveBeenCalled();
  });

  it('runs R2 cleanup for an authorised request', async () => {
    isR2Configured.mockReturnValue(true);
    cleanupExpiredFiles.mockResolvedValue({ deleted: ['file1.pdf', 'file2.pdf'], errors: [] });
    const { req, res } = createMocks({ method: 'POST', headers: { 'x-cleanup-key': 'super-secret-key' } });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(cleanupExpiredFiles).toHaveBeenCalledWith({ dryRun: false });
    expect(JSON.parse(res._getData())).toMatchObject({ success: true, deletedCount: 2, errorCount: 0 });
  });
});
