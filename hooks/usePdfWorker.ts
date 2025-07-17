import { useCallback, useRef, useState } from 'react';
import { Entry, Position } from '@/types/certificate';

interface PdfWorkerMessage {
  type: 'GENERATE_PDF' | 'BATCH_GENERATE';
  id: string;
  data: any;
}

interface PdfWorkerResponse {
  type: 'SUCCESS' | 'BATCH_SUCCESS' | 'ERROR' | 'PROGRESS';
  id: string;
  result?: Uint8Array;
  results?: Array<{ id: string; pdfBytes: Uint8Array }>;
  error?: string;
  progress?: number;
  message?: string;
}

interface GeneratePdfOptions {
  templateBytes: ArrayBuffer;
  entryData: Entry;
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  fontUrls?: Record<string, string>;
}

interface BatchGenerateOptions {
  templateBytes: ArrayBuffer;
  entries: Array<{ id: string; data: Entry }>;
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  fontUrls?: Record<string, string>;
}

export function usePdfWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, { resolve: Function; reject: Function }>>(new Map());
  const [progress, setProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize worker on first use
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker('/workers/pdf-generator.worker.js');
      
      // Set up message handler
      workerRef.current.addEventListener('message', (event: MessageEvent<PdfWorkerResponse>) => {
        const { type, id, result, results, error, progress, message } = event.data;
        const pending = pendingRequests.current.get(id);
        
        switch (type) {
          case 'SUCCESS':
            if (pending && result) {
              pending.resolve(result);
              pendingRequests.current.delete(id);
            }
            break;
            
          case 'BATCH_SUCCESS':
            if (pending && results) {
              pending.resolve(results);
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

  // Generate single PDF
  const generatePdf = useCallback(async (options: GeneratePdfOptions): Promise<Uint8Array> => {
    const worker = getWorker();
    const id = `pdf-${Date.now()}-${Math.random()}`;
    
    setIsProcessing(true);
    setProgress({ percent: 0, message: 'Initializing...' });
    
    try {
      // Prepare font URLs if custom fonts are needed
      const fontUrls = options.fontUrls || {
        Montserrat: '/fonts/Montserrat-Regular.ttf',
        MontserratBold: '/fonts/Montserrat-Bold.ttf',
        Poppins: '/fonts/Poppins-Regular.ttf',
        PoppinsBold: '/fonts/Poppins-Bold.ttf',
        PoppinsItalic: '/fonts/Poppins-Italic.ttf',
        PoppinsBoldItalic: '/fonts/Poppins-BoldItalic.ttf',
        SourceSansPro: '/fonts/SourceSansPro-Regular.ttf',
        SourceSansProBold: '/fonts/SourceSansPro-Bold.ttf',
        SourceSansProItalic: '/fonts/SourceSansPro-Italic.ttf',
        SourceSansProBoldItalic: '/fonts/SourceSansPro-BoldItalic.ttf',
        Nunito: '/fonts/Nunito-Regular.ttf',
        NunitoBold: '/fonts/Nunito-Bold.ttf',
        NunitoItalic: '/fonts/Nunito-Italic.ttf',
        NunitoBoldItalic: '/fonts/Nunito-BoldItalic.ttf',
        GreatVibes: '/fonts/GreatVibes-Regular.ttf',
      };
      
      return new Promise((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });
        
        const message: PdfWorkerMessage = {
          type: 'GENERATE_PDF',
          id,
          data: {
            ...options,
            fontUrls,
            templateBytes: new Uint8Array(options.templateBytes)
          }
        };
        
        worker.postMessage(message, [options.templateBytes]);
      });
    } finally {
      setIsProcessing(false);
      setProgress({ percent: 100, message: 'Complete' });
    }
  }, [getWorker]);

  // Generate batch PDFs
  const generateBatch = useCallback(async (options: BatchGenerateOptions): Promise<Array<{ id: string; pdfBytes: Uint8Array }>> => {
    const worker = getWorker();
    const id = `batch-${Date.now()}-${Math.random()}`;
    
    setIsProcessing(true);
    setProgress({ percent: 0, message: 'Starting batch generation...' });
    
    try {
      // Prepare font URLs
      const fontUrls = options.fontUrls || {
        Montserrat: '/fonts/Montserrat-Regular.ttf',
        MontserratBold: '/fonts/Montserrat-Bold.ttf',
        Poppins: '/fonts/Poppins-Regular.ttf',
        PoppinsBold: '/fonts/Poppins-Bold.ttf',
        PoppinsItalic: '/fonts/Poppins-Italic.ttf',
        PoppinsBoldItalic: '/fonts/Poppins-BoldItalic.ttf',
        SourceSansPro: '/fonts/SourceSansPro-Regular.ttf',
        SourceSansProBold: '/fonts/SourceSansPro-Bold.ttf',
        SourceSansProItalic: '/fonts/SourceSansPro-Italic.ttf',
        SourceSansProBoldItalic: '/fonts/SourceSansPro-BoldItalic.ttf',
        Nunito: '/fonts/Nunito-Regular.ttf',
        NunitoBold: '/fonts/Nunito-Bold.ttf',
        NunitoItalic: '/fonts/Nunito-Italic.ttf',
        NunitoBoldItalic: '/fonts/Nunito-BoldItalic.ttf',
        GreatVibes: '/fonts/GreatVibes-Regular.ttf',
      };
      
      return new Promise((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });
        
        const message: PdfWorkerMessage = {
          type: 'BATCH_GENERATE',
          id,
          data: {
            ...options,
            fontUrls,
            templateBytes: new Uint8Array(options.templateBytes)
          }
        };
        
        worker.postMessage(message, [options.templateBytes]);
      });
    } finally {
      setIsProcessing(false);
      setProgress({ percent: 100, message: 'Batch complete' });
    }
  }, [getWorker]);

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
    generatePdf,
    generateBatch,
    terminate,
    progress,
    isProcessing
  };
}