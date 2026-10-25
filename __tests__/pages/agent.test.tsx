import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import AgentPage from '@/pages/agent';

const token = 'bb_agent_example_key_for_tests_only';

beforeEach(() => {
  jest.clearAllMocks();
  (useSession as jest.Mock).mockReturnValue({
    status: 'authenticated', data: { user: { email: 'owner@example.com' } },
  });
  (useRouter as jest.Mock).mockReturnValue({ query: {}, isReady: true });
  (fetch as jest.Mock).mockImplementation(async (url, options) => ({
    ok: true,
    json: async () => options?.method === 'POST' ? { token }
      : url === '/api/agent/keys' ? { keys: [] } : { jobs: [] },
  }));
});

async function createKey(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Key label'), 'Certificate assistant');
  await user.click(screen.getByRole('button', { name: 'Create API key' }));
  await screen.findByText(token);
}

it('copies the revealed key, confirms success and clears feedback for a new key', async () => {
  const user = userEvent.setup();
  render(<AgentPage />);
  expect(screen.queryByRole('button', { name: 'Copy API key' })).not.toBeInTheDocument();
  await createKey(user);
  await user.click(screen.getByRole('button', { name: 'Copy API key' }));
  expect(await navigator.clipboard.readText()).toBe(token);
  expect(await screen.findByText('Copied')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Dismiss token' }));
  expect(screen.queryByText(token)).not.toBeInTheDocument();
  expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  await createKey(user);
  expect(screen.queryByText('Copied')).not.toBeInTheDocument();
});

it('keeps the key available for manual copying if clipboard access fails', async () => {
  const user = userEvent.setup();
  jest.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Permission denied'));
  render(<AgentPage />);
  await createKey(user);
  await user.click(screen.getByRole('button', { name: 'Copy API key' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy. Select the key and copy it manually.');
  expect(screen.getByText(token)).toBeInTheDocument();
  expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  jest.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  await user.click(screen.getByRole('button', { name: 'Copy API key' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('Copied')).toBeInTheDocument();
});
