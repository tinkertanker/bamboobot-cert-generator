import { ClientPdfGenerator } from '@/lib/pdf/client/pdf-generator-client';
import type { WorkerResponse } from '@/lib/pdf/client/worker/worker-types';
import { FeatureDetector } from '@/lib/pdf/client/feature-detection';
import { ReadableStream } from 'stream/web';

interface PendingRequestHarness {
  pendingRequests: Map<
    string,
    {
      resolve: jest.Mock;
      reject: jest.Mock;
      onFile?: jest.Mock;
    }
  >;
  handleWorkerMessage(event: MessageEvent<WorkerResponse>): void;
}

describe('ClientPdfGenerator streamed worker messages', () => {
  const generator = ClientPdfGenerator.getInstance() as unknown as PendingRequestHarness;

  beforeEach(() => {
    generator.pendingRequests.clear();
  });

  it('refuses individual generation without a streamed file consumer', async () => {
    const result = await ClientPdfGenerator.getInstance().generate({
      templateUrl: 'blob:template',
      entries: [],
      positions: {},
      uiContainerDimensions: { width: 600, height: 400 },
      mode: 'individual'
    });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe(
      'Individual PDF generation requires an onFile callback'
    );
  });

  it.each(['//evil.example/template.pdf', '/\\evil.example/template.pdf'])('rejects resolved remote template %s', async templateUrl => {
    const client = ClientPdfGenerator.getInstance();
    const initialize = jest.spyOn(client, 'initialize').mockResolvedValue();
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => { throw new Error('remote fetch must not run'); });
    try {
      const result = await client.generate({ templateUrl, entries: [], positions: {}, uiContainerDimensions: { width: 800, height: 600 } });
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Cannot load remote templates');
    } finally { initialize.mockRestore(); global.fetch = originalFetch; }
  });

  it('delivers file messages without completing the pending request', () => {
    const resolve = jest.fn();
    const reject = jest.fn();
    const onFile = jest.fn();
    generator.pendingRequests.set('request-1', { resolve, reject, onFile });
    const file = {
      filename: 'certificate.pdf',
      originalIndex: 0,
      data: new Uint8Array([1, 2, 3])
    };

    generator.handleWorkerMessage({
      data: { type: 'file', id: 'request-1', payload: file }
    } as MessageEvent<WorkerResponse>);

    expect(onFile).toHaveBeenCalledWith(file);
    expect(resolve).not.toHaveBeenCalled();
    expect(generator.pendingRequests.has('request-1')).toBe(true);
  });

  it('resolves and removes the request only after completion', () => {
    const resolve = jest.fn();
    const reject = jest.fn();
    generator.pendingRequests.set('request-2', { resolve, reject });
    const payload = { mode: 'individual', fileCount: 2 };

    generator.handleWorkerMessage({
      data: { type: 'complete', id: 'request-2', payload }
    } as MessageEvent<WorkerResponse>);

    expect(resolve).toHaveBeenCalledWith(payload);
    expect(generator.pendingRequests.has('request-2')).toBe(false);
  });

  it('keeps streamed files isolated by request id', () => {
    const firstFile = jest.fn();
    const secondFile = jest.fn();
    generator.pendingRequests.set('first', {
      resolve: jest.fn(),
      reject: jest.fn(),
      onFile: firstFile
    });
    generator.pendingRequests.set('second', {
      resolve: jest.fn(),
      reject: jest.fn(),
      onFile: secondFile
    });

    generator.handleWorkerMessage({
      data: {
        type: 'file',
        id: 'second',
        payload: {
          filename: 'second.pdf',
          originalIndex: 1,
          data: new Uint8Array([2])
        }
      }
    } as MessageEvent<WorkerResponse>);

    expect(firstFile).not.toHaveBeenCalled();
    expect(secondFile).toHaveBeenCalledTimes(1);
  });

  it('rejects and clears a request when the file consumer fails', () => {
    const reject = jest.fn();
    generator.pendingRequests.set('request-3', {
      resolve: jest.fn(),
      reject,
      onFile: jest.fn(() => {
        throw new Error('Blob allocation failed');
      })
    });

    generator.handleWorkerMessage({
      data: {
        type: 'file',
        id: 'request-3',
        payload: {
          filename: 'certificate.pdf',
          originalIndex: 0,
          data: new Uint8Array([1])
        }
      }
    } as MessageEvent<WorkerResponse>);

    expect(reject).toHaveBeenCalledWith(new Error('Blob allocation failed'));
    expect(generator.pendingRequests.has('request-3')).toBe(false);
  });
});

describe('ClientPdfGenerator parser watchdog', () => {
  const originalWorker = global.Worker;
  const originalFetch = global.fetch;
  const workers: TestWorker[] = [];
  class TestWorker extends EventTarget {
    terminated = false;
    constructor() {
      super();
      workers.push(this);
      setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' } })), 0);
    }
    postMessage(request: { id: string }) {
      if (workers.length === 1) return; // First parser never yields or replies.
      this.dispatchEvent(new MessageEvent('message', { data: { type: 'parsed', id: request.id } }));
      setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: {
        type: 'complete', id: request.id, payload: { mode: 'single', pdfData: new Uint8Array([37, 80, 68, 70]) },
      } })), 15000); // Rendering is not subject to the parsing deadline.
    }
    terminate() { this.terminated = true; }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    workers.length = 0;
    global.Worker = TestWorker as unknown as typeof Worker;
    jest.spyOn(FeatureDetector.getInstance(), 'checkCapabilities').mockResolvedValue({
      webWorker: true, indexedDB: true, arrayBuffer: true, fetch: true,
      memoryEstimate: true, sufficientMemory: true, overallSupport: true,
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } }),
    } as unknown as Response));
  });

  afterEach(() => {
    ClientPdfGenerator.getInstance().destroy();
    global.Worker = originalWorker;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('terminates a stuck parser, settles the caller, and gives the next request a healthy worker', async () => {
    const client = ClientPdfGenerator.getInstance();
    const options = { templateUrl: '/template.pdf', entries: [], positions: {}, uiContainerDimensions: { width: 600, height: 400 } };
    const fetchTemplate = global.fetch;
    let finishDownload!: () => void;
    const download = new Promise<void>(resolve => { finishDownload = resolve; });
    global.fetch = jest.fn(async (input, init) => {
      if (input === '/slow.pdf') await download;
      return fetchTemplate(input, init);
    });
    const stuck = client.generate(options);
    await jest.advanceTimersByTimeAsync(1);
    const downloading = client.generate({ ...options, templateUrl: '/slow.pdf' });
    await jest.advanceTimersByTimeAsync(12000);
    const failed = await stuck;
    expect(failed.success).toBe(false);
    expect(failed.error?.message).toContain('PDF template parsing timed out');
    expect(workers[0].terminated).toBe(true);

    finishDownload();
    expect(await downloading).toMatchObject({ success: false, error: new Error('PDF worker is not available') });
    // A failed request must not leave a watchdog that throws after it settles.
    await jest.advanceTimersByTimeAsync(12001);

    const retry = client.generate(options);
    await jest.advanceTimersByTimeAsync(15001);
    expect(await retry).toMatchObject({ success: true, data: new Uint8Array([37, 80, 68, 70]) });
    expect(workers).toHaveLength(2);
    expect(workers[1].terminated).toBe(false);
  });

  it('rejects an oversized body even without a Content-Length header', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true, headers: { get: () => null },
      body: new ReadableStream({ start(controller) {
        const chunk = new Uint8Array(1024 * 1024);
        for (let i = 0; i < 33; i++) controller.enqueue(chunk);
        controller.close();
      } }),
    } as unknown as Response));
    const result = ClientPdfGenerator.getInstance().generate({ templateUrl: '/large.pdf', entries: [], positions: {}, uiContainerDimensions: { width: 600, height: 400 } });
    await jest.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ success: false, error: new Error('PDF resource budget exceeded: input bytes') });
  });
});
