import { limits } from '@/lib/pdf/parser-budget.cjs';

/** The main thread can terminate even a worker stuck in a synchronous parser. */
export function watchPdfParsing(worker: Worker, id: string): () => void {
  const cleanup = () => {
    clearTimeout(timer);
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', cleanup);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.data.id === id && ['parsed', 'complete', 'error'].includes(event.data.type)) cleanup();
  };
  const timer = setTimeout(() => {
    cleanup();
    worker.terminate();
    // Notify all owners of this worker, including progressive requests. No
    // request may continue waiting for or retrying against a terminated worker.
    worker.dispatchEvent(new ErrorEvent('error', { message: 'PDF template parsing timed out' }));
  }, limits.milliseconds + 2000);
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', cleanup);
  return cleanup;
}
