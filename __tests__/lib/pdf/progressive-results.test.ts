import { mapProgressivePdfFiles } from '@/lib/pdf/progressive-results';

describe('mapProgressivePdfFiles', () => {
  it('carries the original row index through the API-to-UI adapter', () => {
    expect(
      mapProgressivePdfFiles([
        { index: 1, filename: 'second.pdf', path: '/generated/second.pdf' }
      ])
    ).toEqual([
      {
        originalIndex: 1,
        filename: 'second.pdf',
        url: '/generated/second.pdf'
      }
    ]);
  });
});
