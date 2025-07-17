import { useCallback, useRef, useState } from 'react';

interface CsvWorkerMessage {
  type: 'PARSE_CSV' | 'PARSE_CHUNK';
  id: string;
  data: any;
}

interface CsvWorkerResponse {
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  id: string;
  result?: ParseResult;
  error?: string;
  progress?: number;
  message?: string;
}

interface ParseOptions {
  format?: 'auto' | 'csv' | 'tsv';
  hasHeaders?: boolean | 'auto';
}

interface ParseResult {
  headers: string[];
  data: Array<Record<string, { text: string; isEmail?: boolean }>>;
  format: 'csv' | 'tsv';
  emailColumn: string | null;
  rowCount: number;
  columnCount: number;
}

export function useCsvWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, { resolve: Function; reject: Function }>>(new Map());
  const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize worker on first use
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker('/workers/csv-parser.worker.js');
      
      // Set up message handler
      workerRef.current.addEventListener('message', (event: MessageEvent<CsvWorkerResponse>) => {
        const { type, id, result, error, progress, message } = event.data;
        const pending = pendingRequests.current.get(id);
        
        switch (type) {
          case 'SUCCESS':
            if (pending && result) {
              pending.resolve(result);
              pendingRequests.current.delete(id);
            }
            break;
            
          case 'ERROR':
            if (pending) {
              pending.reject(new Error(error || 'Unknown error'));
              pendingRequests.current.delete(id);
            }
            break;
            
          case 'PROGRESS':
            if (progress !== undefined && message) {
              setProgress({ percent: progress, message });
            }
            break;
        }
      });
    }
    return workerRef.current;
  }, []);

  // Parse CSV/TSV content
  const parseContent = useCallback(async (
    content: string, 
    options: ParseOptions = {}
  ): Promise<ParseResult> => {
    const worker = getWorker();
    const id = `parse-${Date.now()}-${Math.random()}`;
    
    setIsProcessing(true);
    setProgress({ percent: 0, message: 'Starting parse...' });
    
    try {
      return new Promise((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });
        
        const message: CsvWorkerMessage = {
          type: 'PARSE_CSV',
          id,
          data: {
            content,
            options
          }
        };
        
        worker.postMessage(message);
      });
    } finally {
      setIsProcessing(false);
      setProgress({ percent: 100, message: 'Parse complete' });
    }
  }, [getWorker]);

  // Parse file
  const parseFile = useCallback(async (
    file: File,
    options: ParseOptions = {}
  ): Promise<ParseResult> => {
    const content = await file.text();
    return parseContent(content, options);
  }, [parseContent]);

  // Terminate worker
  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    pendingRequests.current.clear();
    setIsProcessing(false);
    setProgress({ percent: 0, message: '' });
  }, []);

  return {
    parseContent,
    parseFile,
    terminate,
    progress,
    isProcessing
  };
}