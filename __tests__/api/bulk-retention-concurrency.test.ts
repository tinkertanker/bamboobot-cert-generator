/** @jest-environment node */

jest.mock('@/lib/storage/mark-generated', () => ({
  markGeneratedFileAsEmailed: jest.fn(),
}));

import {
  cleanupEmailQueueInterval,
  markGeneratedRetentionInBatches,
} from '@/pages/api/send-bulk-email';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';

describe('bulk retention metadata updates', () => {
  afterAll(() => cleanupEmailQueueInterval());

  it('limits concurrent cloud object rewrites', async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    (markGeneratedFileAsEmailed as jest.Mock).mockImplementation(() => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise<void>(resolve => releases.push(() => {
        active -= 1;
        resolve();
      }));
    });

    const pending = markGeneratedRetentionInBatches(
      Array.from({ length: 10 }, (_, index) => `/file-${index}.pdf`),
      'u1',
    );

    await new Promise(resolve => setImmediate(resolve));
    expect(active).toBe(4);
    while (releases.length > 0) {
      releases.splice(0, 4).forEach(release => release());
      await new Promise(resolve => setImmediate(resolve));
    }
    await pending;

    expect(peak).toBe(4);
    expect(markGeneratedFileAsEmailed).toHaveBeenCalledTimes(10);
  });
});
