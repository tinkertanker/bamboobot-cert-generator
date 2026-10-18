import { act, renderHook, waitFor } from '@testing-library/react';
import { useProgressivePdfGeneration } from '@/hooks/useProgressivePdfGeneration';
import type { Positions, TableData } from '@/types/certificate';

type BatchBody = {
  batchId: string;
  startIndex: number;
  templateFilename: string;
  data: unknown[];
  filenames: string[];
};

const positions = { name: { x: 50, y: 50, fontSize: 20 } } as unknown as Positions;

function rows(count: number): TableData[] {
  return Array.from({ length: count }, (_, index) => ({ name: `Person ${index + 1}` }));
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

/** Answers each batch request with one file per row. */
function succeed(init?: RequestInit) {
  const body = JSON.parse(init?.body as string) as BatchBody;
  return jsonResponse(200, {
    files: body.filenames.map((filename, offset) => ({
      index: body.startIndex + offset,
      filename,
      path: `/signed/${filename}`,
    })),
  });
}

function sentBodies(fetchMock: jest.Mock): BatchBody[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

function setup(tableData: TableData[]) {
  const setSelectedNamingColumn = jest.fn();
  const hook = renderHook(() =>
    useProgressivePdfGeneration({
      tableData,
      positions,
      uploadedFile: 'u_u1/template.pdf',
      selectedNamingColumn: 'name',
      setSelectedNamingColumn,
    }),
  );
  return { ...hook, setSelectedNamingColumn };
}

describe('useProgressivePdfGeneration', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async (_url: string, init?: RequestInit) => succeed(init));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the rows to /api/generate-batch in batches and aggregates the files', async () => {
    const { result } = setup(rows(5));

    await act(async () => {
      await result.current.startProgressiveGeneration('individual', 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/generate-batch')).toBe(true);
    const bodies = sentBodies(fetchMock);
    expect(bodies.map(body => [body.startIndex, body.data.length])).toEqual([
      [0, 2],
      [2, 2],
      [4, 1],
    ]);
    // One run shares one batch ID and the stored template.
    expect(new Set(bodies.map(body => body.batchId)).size).toBe(1);
    expect(bodies[0].batchId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(bodies[0].templateFilename).toBe('u_u1/template.pdf');

    expect(result.current.results).toEqual(
      expect.objectContaining({ status: 'completed', totalProcessed: 5, totalFailed: 0 }),
    );
    expect(result.current.results?.files.map(file => file.index)).toEqual([0, 1, 2, 3, 4]);
    expect(result.current.progress).toEqual(
      expect.objectContaining({ status: 'completed', processed: 5, total: 5, totalBatches: 3 }),
    );
    expect(result.current.isGenerating).toBe(false);
  });

  it('gives duplicate names unique filenames across the whole run, not just per batch', async () => {
    const { result } = setup([{ name: 'Ada' }, { name: 'Ada' }, { name: 'Ada' }]);
    await act(async () => {
      await result.current.startProgressiveGeneration('individual', 1);
    });
    const filenames = sentBodies(fetchMock).flatMap(body => body.filenames);
    expect(new Set(filenames).size).toBe(3);
  });

  it('retries a batch after a 429 and a 5xx response', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: 'slow down' }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(503, { error: 'busy' }));
    const { result } = setup(rows(2));

    let run!: Promise<void>;
    act(() => {
      run = result.current.startProgressiveGeneration('individual', 2);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
      await run;
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.results).toEqual(expect.objectContaining({ totalProcessed: 2, totalFailed: 0 }));
  });

  it('does not retry client errors and records the batch rows as failed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Template does not belong to the current user' }));
    const { result } = setup(rows(3));

    await act(async () => {
      await result.current.startProgressiveGeneration('individual', 2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.results).toEqual(
      expect.objectContaining({ status: 'partial', totalProcessed: 1, totalFailed: 2 }),
    );
    expect(result.current.results?.errors).toEqual([
      { index: 0, error: 'Template does not belong to the current user' },
      { index: 1, error: 'Template does not belong to the current user' },
    ]);
  });

  it('reports an error when every batch fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'Bad input' }));
    const { result } = setup(rows(2));
    await act(async () => {
      await result.current.startProgressiveGeneration('individual', 2);
    });
    expect(result.current.progress?.status).toBe('error');
    expect(result.current.error).toBe('Bad input');
  });

  it('pauses between batches and resumes where it stopped', async () => {
    let releaseFirst!: () => void;
    fetchMock.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise(resolve => {
          releaseFirst = () => resolve(succeed(init));
        }),
    );
    const { result } = setup(rows(4));

    let run!: Promise<void>;
    act(() => {
      run = result.current.startProgressiveGeneration('individual', 2);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.pauseGeneration();
      releaseFirst();
    });
    await waitFor(() => expect(result.current.progress?.status).toBe('paused'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.resumeGeneration();
      await run;
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.results?.totalProcessed).toBe(4);
  });

  it('cancels a run, aborting the request in flight and sending no more batches', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const { result } = setup(rows(4));

    let run!: Promise<void>;
    act(() => {
      run = result.current.startProgressiveGeneration('individual', 2);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.cancelGeneration();
      await run;
    });

    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.results).toBeNull();
  });

  it('refuses bulk mode and runs without an uploaded template', async () => {
    const { result } = setup(rows(2));
    await act(async () => {
      await result.current.startProgressiveGeneration('bulk', 2);
    });
    expect(result.current.error).toMatch(/individual/i);

    const noTemplate = renderHook(() =>
      useProgressivePdfGeneration({
        tableData: rows(2),
        positions,
        uploadedFile: null,
        selectedNamingColumn: 'name',
        setSelectedNamingColumn: jest.fn(),
      }),
    );
    await act(async () => {
      await noTemplate.result.current.startProgressiveGeneration('individual', 2);
    });
    expect(noTemplate.result.current.error).toMatch(/upload/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
