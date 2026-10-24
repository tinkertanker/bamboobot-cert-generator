import { PdfQueueManager } from '@/lib/pdf/pdf-queue';

describe('PdfQueueManager filenames', () => {
  it('preallocates stable unique filenames in original item order', async () => {
    const manager = new PdfQueueManager(
      'session',
      'template.pdf',
      {},
      { width: 600, height: 400 },
      'individual'
    );

    await manager.initializeQueue(
      [
        { Name: { text: 'Ada Lovelace', color: [0, 0, 0] } },
        { Name: { text: 'Ada_Lovelace', color: [0, 0, 0] } },
        { Name: { text: 'Ada Lovelace', color: [0, 0, 0] } }
      ],
      'Name'
    );

    expect(manager.getQueue().items.map((item) => item.filename)).toEqual([
      'Ada_Lovelace.pdf',
      'Ada_Lovelace-1.pdf',
      'Ada_Lovelace-2.pdf'
    ]);
  });

  it('preserves source row indices when an earlier recipient fails', async () => {
    const manager = new PdfQueueManager(
      'session',
      'template.pdf',
      {},
      { width: 600, height: 400 },
      'individual',
      { batchSize: 2, maxRetries: 1 }
    );

    await manager.initializeQueue([{ Name: 'First' }, { Name: 'Second' }], 'Name');
    await manager.startProcessing();
    await manager.processNextBatch(async (item) => {
      if (item.index === 0) throw new Error('first recipient failed');
      return { path: '/generated/second.pdf', filename: item.filename };
    });

    expect(manager.getResults()).toMatchObject({
      files: [{ index: 1, filename: 'Second.pdf', path: '/generated/second.pdf' }],
      errors: [{ index: 0, error: 'first recipient failed' }]
    });
  });

  it('resumes a serialised job without repeating completed rows or renaming duplicates', async () => {
    const manager = new PdfQueueManager('recovered', 'template.pdf', {},
      { width: 600, height: 400 }, 'individual', { batchSize: 1 });
    await manager.initializeQueue([{ Name: 'Ada Lovelace' }, { Name: 'Ada_Lovelace' }], 'Name');
    await manager.startProcessing();
    await manager.processNextBatch(async item => ({ filename: item.filename, path: '/first.pdf' }));

    // D1 persists JSON, not class instances or live Date objects.
    const restored = PdfQueueManager.restore(JSON.parse(JSON.stringify(manager.getQueue())));
    await restored.processNextBatch(async item => ({ filename: item.filename, path: '/second.pdf' }));

    expect(restored.getProgress()).toMatchObject({ status: 'completed', processed: 2, failed: 0 });
    expect(restored.getResults().files).toEqual([
      { index: 0, filename: 'Ada_Lovelace.pdf', path: '/first.pdf' },
      { index: 1, filename: 'Ada_Lovelace-1.pdf', path: '/second.pdf' },
    ]);
  });

  it('checkpoints at the invocation budget and resumes unprocessed rows without counting them as failures', async () => {
    jest.useFakeTimers();
    try {
      const manager = new PdfQueueManager('bounded', 'template.pdf', {},
        { width: 600, height: 400 }, 'individual', { batchSize: 3 });
      await manager.initializeQueue([{ Name: 'First' }, { Name: 'Second' }, { Name: 'Third' }], 'Name');
      await manager.startProcessing();
      await manager.processNextBatch(async item => {
        jest.setSystemTime(Date.now() + 20_000);
        return { filename: item.filename, path: '/first.pdf' };
      }, 20_000);

      expect(manager.getProgress()).toMatchObject({ status: 'processing', processed: 1, failed: 0 });
      expect(manager.getResults().files).toEqual([
        { index: 0, filename: 'First.pdf', path: '/first.pdf' },
      ]);

      const restored = PdfQueueManager.restore(JSON.parse(JSON.stringify(manager.getQueue())));
      await restored.processNextBatch(async item => ({ filename: item.filename, path: `/${item.filename}` }));
      expect(restored.getProgress()).toMatchObject({ status: 'completed', processed: 3, failed: 0 });
      expect(restored.getResults().files).toEqual([
        { index: 0, filename: 'First.pdf', path: '/first.pdf' },
        { index: 1, filename: 'Second.pdf', path: '/Second.pdf' },
        { index: 2, filename: 'Third.pdf', path: '/Third.pdf' },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
