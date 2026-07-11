import { ClientPdfGenerator } from '@/lib/pdf/client/pdf-generator-client';
import type { WorkerResponse } from '@/lib/pdf/client/worker/worker-types';

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
