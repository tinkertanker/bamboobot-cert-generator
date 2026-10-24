import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import AgentPage from '@/pages/agent';

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));
jest.mock('next/router', () => ({ useRouter: () => ({ isReady: true, query: { job: 'job-1' } }) }));

const job = {
  id: 'job-1', label: 'Graduation', status: 'awaiting_approval', total: 12,
  createdAt: '2026-10-24T00:00:00Z', expiresAt: '2026-11-24T00:00:00Z',
  inputHash: 'immutable-hash', sampleUrl: '/api/agent/jobs/job-1/sample',
  inputUrl: '/api/agent/jobs/job-1?artifact=input',
  fields: ['Name'], ignoredFields: ['Email'], sampleRowIds: ['row-9', 'row-1'], files: [],
};

describe('AgentPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({ status: 'authenticated', data: { user: { email: 'owner@example.com' } } });
    global.fetch = jest.fn(async (url, options) => ({
      ok: true,
      json: async () => options?.method === 'POST'
        ? { token: 'secret-once', key: { id: 'key-1' } }
        : String(url).endsWith('/keys') ? { keys: [] }
          : String(url).endsWith('/jobs') ? { jobs: [job] } : { job },
    })) as jest.Mock;
  });

  it('does not fetch anything without an authenticated session', () => {
    (useSession as jest.Mock).mockReturnValue({ status: 'unauthenticated', data: null });
    render(<AgentPage />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download all frozen recipient inputs' })).not.toBeInTheDocument();
  });

  it('shows the actual sample and immutable inputs, and approves only on explicit click', async () => {
    render(<AgentPage />);
    const approve = await screen.findByRole('button', { name: /approve sample and generate/i });
    expect(screen.getByTitle('Sample certificate PDF')).toHaveAttribute('src', job.sampleUrl);
    expect(screen.getByText('immutable-hash')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download all frozen recipient inputs' })).toHaveAttribute('href', job.inputUrl);
    expect(screen.getByText(/Review all frozen recipient inputs/)).toBeInTheDocument();
    const sampleRows = screen.getByRole('list', { name: 'Sample PDF pages' });
    expect(Array.from(sampleRows.children).map(row => row.textContent)).toEqual([
      'PDF page 1: row-9', 'PDF page 2: row-1',
    ]);
    expect((fetch as jest.Mock).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    fireEvent.click(approve);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/agent/jobs/job-1', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', inputHash: 'immutable-hash' }),
    })));
  });

  it('creates a scoped key and shows the token only until dismissed', async () => {
    render(<AgentPage />);
    fireEvent.change(screen.getByLabelText('Key label'), { target: { value: 'My agent' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Create API key' }));
    expect(await screen.findByText('secret-once')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/agent/keys', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'My agent', scopes: ['certificates:write', 'certificates:read'], expiresInDays: 30 }),
    }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss token/i }));
    expect(screen.queryByText('secret-once')).not.toBeInTheDocument();
  });

  it('does not offer approval without a sample PDF', async () => {
    const original = fetch as jest.Mock;
    const implementation = original.getMockImplementation()!;
    original.mockImplementation(async (url, options) => String(url).endsWith('/job-1')
      ? { ok: true, json: async () => ({ job: { ...job, sampleUrl: null } }) }
      : implementation(url, options));
    render(<AgentPage />);
    expect(await screen.findByRole('button', { name: /approve sample and generate/i })).toBeDisabled();
  });

  it('keeps approval errors visible after refreshing the authoritative job', async () => {
    const original = fetch as jest.Mock;
    const implementation = original.getMockImplementation()!;
    original.mockImplementation(async (url, options) => options?.method === 'POST'
      ? { ok: false, status: 409, json: async () => ({ error: 'Inputs changed. Review a new sample.' }) }
      : implementation(url, options));
    render(<AgentPage />);
    fireEvent.click(await screen.findByRole('button', { name: /approve sample and generate/i }));
    expect(await screen.findByText('Inputs changed. Review a new sample.')).toBeInTheDocument();
    await screen.findByTitle('Sample certificate PDF');
    expect(screen.getByText('Inputs changed. Review a new sample.')).toBeInTheDocument();
  });

  it('retries failed jobs explicitly, without offering approval again', async () => {
    const original = fetch as jest.Mock;
    const implementation = original.getMockImplementation()!;
    original.mockImplementation(async (url, options) => !options?.method && String(url).endsWith('/job-1')
      ? { ok: true, json: async () => ({ job: { ...job, status: 'failed', error: 'Generation interrupted.' } }) }
      : implementation(url, options));
    render(<AgentPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry generation' }));
    expect(screen.queryByRole('button', { name: /approve sample and generate/i })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/agent/jobs/job-1', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry' }),
    }));
    await screen.findByRole('button', { name: 'Retry generation' });
  });

  it.each(['preparing', 'queued', 'running'])('shows %s progress, polls after 3 seconds and shows completed download links', async status => {
    jest.useFakeTimers();
    try {
      let completed = false;
      (fetch as jest.Mock).mockImplementation(async url => {
        const current = { ...job, status: completed ? 'completed' : status, progress: status === 'queued' ? 0 : 5,
          zipUrl: '/api/zip', manifestUrl: '/api/manifest',
          files: [{ filename: 'Alice.pdf', url: '/api/alice', sha256: 'file-hash', size: 100 }],
        };
        return { ok: true, json: async () => String(url).endsWith('/keys') ? { keys: [] }
          : String(url).endsWith('/jobs') ? { jobs: [current] } : { job: current } };
      });
      const view = render(<AgentPage />);
      await act(async () => {});
      expect(screen.getAllByText(`Progress: ${status === 'queued' ? 0 : 5}/${job.total}`)).toHaveLength(2);
      expect(screen.queryByRole('link', { name: 'Download ZIP' })).not.toBeInTheDocument();
      completed = true;
      await act(async () => { jest.advanceTimersByTime(2999); });
      expect(screen.queryByRole('link', { name: 'Download ZIP' })).not.toBeInTheDocument();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.getByRole('link', { name: 'Download ZIP' })).toHaveAttribute('href', '/api/zip');
      expect(screen.getByRole('link', { name: 'Download manifest' })).toHaveAttribute('href', '/api/manifest');
      expect(screen.getByRole('link', { name: 'Alice.pdf' })).toHaveAttribute('href', '/api/alice');
      expect(screen.queryByText(/^Progress:/)).not.toBeInTheDocument();
      const calls = (fetch as jest.Mock).mock.calls.length;
      await act(async () => { jest.advanceTimersByTime(3000); });
      expect((fetch as jest.Mock).mock.calls).toHaveLength(calls);
      view.unmount();
    } finally { jest.useRealTimers(); }
  });

  it('handles jobs without optional input downloads or progress', async () => {
    (fetch as jest.Mock).mockImplementation(async url => {
      const current = { ...job, status: 'running', inputUrl: undefined };
      return { ok: true, json: async () => String(url).endsWith('/keys') ? { keys: [] }
        : String(url).endsWith('/jobs') ? { jobs: [current] } : { job: current } };
    });
    render(<AgentPage />);
    await screen.findByTitle('Sample certificate PDF');
    expect(screen.queryByRole('link', { name: 'Download all frozen recipient inputs' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Progress:/)).not.toBeInTheDocument();
  });

  it('revokes a key with confirmation and the JSON mutation header', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const original = fetch as jest.Mock;
    const implementation = original.getMockImplementation()!;
    original.mockImplementation(async (url, options) => !options?.method && String(url).endsWith('/keys')
      ? { ok: true, json: async () => ({ keys: [{ id: 'key-1', label: 'Assistant', scopes: ['certificates:read'] }] }) }
      : implementation(url, options));
    try {
      render(<AgentPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Revoke Assistant' }));
      expect(fetch).toHaveBeenCalledWith('/api/agent/keys?id=key-1', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      });
      await screen.findByRole('button', { name: 'Revoke Assistant' });
    } finally { confirm.mockRestore(); }
  });
});
