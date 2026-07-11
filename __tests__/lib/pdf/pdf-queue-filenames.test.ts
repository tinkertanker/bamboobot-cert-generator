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
});
