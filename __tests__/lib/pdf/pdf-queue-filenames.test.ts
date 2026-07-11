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
});
