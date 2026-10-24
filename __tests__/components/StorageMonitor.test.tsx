import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StorageMonitor } from '@/components/StorageMonitor';

it('finishes every cleanup page before refreshing the remaining storage', async () => {
  let remaining = 13;
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === '/api/dev-cleanup') {
      const { cursor } = JSON.parse(init!.body as string);
      const count = cursor === 'second-page' ? 3 : 10;
      remaining -= count;
      return { ok: true, json: async () => ({ deletedFiles: count, freedSpace: count * 10 * 1024 * 1024,
        cursor: cursor ? null : 'second-page' }) } as Response;
    }
    const directory = { path: 'generated', totalSize: remaining * 10 * 1024 * 1024, fileCount: remaining, files: [] };
    return { ok: true, json: async () => ({ totalSize: directory.totalSize,
      directories: { generated: directory, tempImages: { ...directory, totalSize: 0, fileCount: 0 } } }) } as Response;
  });
  try {
    render(<StorageMonitor />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(screen.getByText('0 Bytes')).toBeInTheDocument());
  } finally {
    confirm.mockRestore();
    jest.mocked(fetch).mockReset();
  }
});
