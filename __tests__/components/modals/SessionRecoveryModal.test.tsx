import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getSession } from 'next-auth/react';
import { SessionRecoveryModal } from '@/components/modals/SessionRecoveryModal';
import { SessionStorage } from '@/lib/session-storage';
import { guardLocalStorageForUser } from '@/lib/storage/account-scope';

jest.mock('next-auth/react', () => ({ getSession: jest.fn() }));
const account = (id: string) => ({ user: { id, tier: 'free' as const, dailyPdfCount: 0, dailyEmailCount: 0 }, expires: '2099-01-01' });
const auth = jest.mocked(getSession);
const sessionKey = 'bamboobot_current_session_v1';

function preserve(raw: string) {
  localStorage.setItem(sessionKey, raw);
  expect(SessionStorage.archiveSession('alice')).toBe(true);
}

async function downloadedText() {
  const blob = jest.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  guardLocalStorageForUser('alice');
  auth.mockResolvedValue(account('alice'));
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });

it('exports readable text and lossless damaged originals without changing any storage', async () => {
  const original = '{"tableInput":"A damaged session\ud800"';
  preserve(original);
  const snapshot = { ...localStorage };
  const { unmount } = render(<SessionRecoveryModal userId="alice" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download table text from copy 1' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no readable table text');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Download original recovery file 1' }));
  await screen.findByText(/Download started/);
  expect(JSON.parse(await downloadedText()).session).toBe(original);
  expect({ ...localStorage }).toEqual(snapshot);
  unmount();

  localStorage.clear();
  guardLocalStorageForUser('alice');
  const tableInput = 'Name\tNote\r\nAlice\t<not markup>\r\n';
  preserve(JSON.stringify({ tableInput, lastModified: 'broken timestamp' }));
  render(<SessionRecoveryModal userId="alice" onClose={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Download table text from copy 1' }));
  await screen.findByText(/Download started/);
  expect(await downloadedText()).toBe(tableInput);
});

it.each(['other account', 'signed out', 'storage owner changed'])('blocks stale downloads when %s', async (change) => {
  preserve('private Alice session');
  render(<SessionRecoveryModal userId="alice" onClose={() => {}} />);
  const download = await screen.findByRole('button', { name: 'Download original recovery file 1' });
  if (change === 'storage owner changed') guardLocalStorageForUser('bob');
  else auth.mockResolvedValue(change === 'signed out' ? null : account('bob'));
  fireEvent.click(download);
  expect(await screen.findByRole('alert')).toHaveTextContent('Recovery is unavailable');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.queryByText('Recovery copy 1')).not.toBeInTheDocument();
});

it('never lists unknown copies and cancels a pending download when closed', async () => {
  localStorage.setItem('bamboobot_quarantine_legacy', JSON.stringify({ [sessionKey]: 'private unknown data' }));
  const empty = render(<SessionRecoveryModal userId="alice" onClose={() => {}} />);
  await screen.findByText(/No recovery copies/);
  expect(screen.queryByText(/private unknown data/)).not.toBeInTheDocument();
  empty.unmount();

  preserve('private Alice data');
  const mounted = render(<SessionRecoveryModal userId="alice" onClose={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Download original recovery file 1' });
  let resolve!: (value: Awaited<ReturnType<typeof getSession>>) => void;
  auth.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeDisabled());
  mounted.unmount();
  await act(async () => { resolve(account('alice')); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
