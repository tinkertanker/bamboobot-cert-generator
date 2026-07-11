import { useState, useCallback, useEffect, useRef } from 'react';
import { ClientPdfGenerator } from '@/lib/pdf/client/pdf-generator-client';
import { FeatureDetector } from '@/lib/pdf/client/feature-detection';
import { DEFAULT_FONT_SIZE } from '@/utils/constants';
import { measureText } from '@/utils/textMeasurement';
import type { TableData, Positions, PdfFile } from '@/types/certificate';
import {
  assessIndividualPdfCapacity,
  estimateTemplateBytes,
  type CapacityDecision
} from '@/lib/pdf/client/individual-capacity';

export interface UseClientPdfGenerationProps {
  tableData: TableData[];
  positions: Positions;
  uploadedFile: File | string | null;
  uploadedFileUrl?: string | null;
  localFileBlob?: Blob | null;
  localBlobUrl?: string | null;
  localPdfByteLength?: number | null;
  selectedNamingColumn: string;
  setSelectedNamingColumn: (column: string) => void;
  enabled?: boolean;
}

export interface UseClientPdfGenerationReturn {
  isClientSupported: boolean;
  isGenerating: boolean;
  isGeneratingIndividual: boolean;
  progress: number;
  stage: string;
  generatedPdfUrl: string | null;
  pdfDownloadUrl: string | null;
  individualPdfsData: PdfFile[] | null;
  generatePdf: () => Promise<void>;
  generateIndividualPdfs: () => Promise<void>;
  handleDownloadPdf: () => void;
  clearPdfData: () => void;
  getCapabilityReport: () => Promise<string>;
  canHandleDataSize: (rowCount: number) => Promise<boolean>;
  assessIndividualCapacity: () => Promise<CapacityDecision>;
}

export function useClientPdfGeneration({
  tableData,
  positions,
  uploadedFile,
  uploadedFileUrl,
  localFileBlob,
  localBlobUrl,
  localPdfByteLength,
  selectedNamingColumn,
  setSelectedNamingColumn,
  enabled = true
}: UseClientPdfGenerationProps): UseClientPdfGenerationReturn {
  const [isClientSupported, setIsClientSupported] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingIndividual, setIsGeneratingIndividual] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [individualPdfsData, setIndividualPdfsData] = useState<PdfFile[] | null>(null);
  
  const generatorRef = useRef<ClientPdfGenerator | null>(null);
  const featureDetectorRef = useRef<FeatureDetector | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const individualGenerationSequenceRef = useRef(0);

  // Initialize on mount
  useEffect(() => {
    if (!enabled) return;

    const initializeClient = async () => {
      try {
        featureDetectorRef.current = FeatureDetector.getInstance();
        const capabilities = await featureDetectorRef.current.checkCapabilities();
        setIsClientSupported(capabilities.overallSupport);

        if (capabilities.overallSupport) {
          generatorRef.current = ClientPdfGenerator.getInstance({
            workerPath: '/pdf-worker.js',
            onProgress: (prog, stg) => {
              setProgress(prog);
              setStage(stg);
            }
          });
        }
      } catch (error) {
        console.error('Failed to initialize client PDF generator:', error);
        setIsClientSupported(false);
      }
    };

    initializeClient();

    // Cleanup on unmount
    return () => {
      individualGenerationSequenceRef.current += 1;
      cleanupBlobUrls();
      if (generatorRef.current) {
        generatorRef.current.destroy();
      }
    };
  }, [enabled]);

  // Cleanup blob URLs
  const cleanupBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    blobUrlsRef.current = [];
  }, []);

  // Helper function to convert hex color to RGB array
  const hexToRgb = useCallback((hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
        ]
      : [0, 0, 0];
  }, []);

  // Helper function to prepare data for client-side generation
  const prepareDataForClient = useCallback(() => {
    return tableData.map((row) => {
      const entry: {
        [key: string]: {
          text: string;
          color?: [number, number, number];
          font?: string | any;
          bold?: boolean;
          oblique?: boolean;
          uiMeasurements?: {
            width: number;
            height: number;
            actualHeight: number;
          };
        };
      } = {};
      
      Object.keys(row).forEach((key) => {
        if (positions[key]?.isVisible === false) {
          return;
        }

        const fontSize = positions[key]?.fontSize || DEFAULT_FONT_SIZE;
        const measurements = measureText(row[key], fontSize, positions[key]?.bold ? "700" : "500");
        const position = positions[key];
        
        entry[key] = {
          text: row[key],
          color: position?.color ? hexToRgb(position.color) : hexToRgb("#000000"),
          font: position?.fontFamily,
          bold: position?.bold,
          oblique: position?.italic,
          uiMeasurements: measurements
        };
      });
      
      return entry;
    });
  }, [tableData, positions, hexToRgb]);

  // Helper function to prepare positions for client-side generation
  const preparePositionsForClient = useCallback(() => {
    return Object.fromEntries(
      Object.entries(positions)
        .filter(([, pos]) => pos.isVisible !== false)
        .map(([key, pos]) => [
          key,
          {
            x: pos.x / 100,
            y: pos.y / 100,
            fontSize: pos.fontSize || DEFAULT_FONT_SIZE,
            font: pos.fontFamily || "Helvetica",
            bold: pos.bold || false,
            oblique: pos.italic || false,
            alignment: pos.alignment || "left",
            textMode: pos.textMode || "shrink",
            width: pos.width || 90,
            lineHeight: pos.lineHeight || 1.2
          }
        ])
    );
  }, [positions]);

  // Get template URL
  const getTemplateUrl = useCallback(() => {
    // Priority 1: Use local blob URL if available (for user uploads)
    if (localBlobUrl) {
      console.log('Using local blob URL for template:', localBlobUrl);
      return localBlobUrl;
    }
    
    // Priority 2: Check uploadedFileUrl
    if (uploadedFileUrl) {
      // Use local paths or blob URLs directly
      if (uploadedFileUrl.startsWith('/') || uploadedFileUrl.startsWith('blob:')) {
        // Handle image to PDF conversion for local paths
        if (uploadedFileUrl.match(/\.(jpg|jpeg|png)$/i)) {
          const pdfUrl = uploadedFileUrl.replace(/\.(jpg|jpeg|png)$/i, '.pdf');
          return pdfUrl;
        }
        return uploadedFileUrl;
      }
      // Skip remote URLs to avoid CORS issues
      if (/^https?:\/\//i.test(uploadedFileUrl)) {
        console.warn('Skipping remote URL to avoid CORS:', uploadedFileUrl);
        // Don't return remote URLs for client-side generation
      }
    }
    
    // Priority 3: Handle File objects
    if (uploadedFile instanceof File) {
      // Handle Dev Mode template specially
      if (uploadedFile.name === 'dev-mode-template.pdf') {
        return '/template_images/dev-mode-template.pdf';
      }
      // For other File objects, we should have a localBlobUrl
      console.warn('File object without blob URL, this should not happen');
    }
    
    // Priority 4: Handle string paths
    if (typeof uploadedFile === 'string') {
      // Check if it's already a local path
      if (uploadedFile.startsWith('/')) {
        return uploadedFile;
      }
      // Handle dev mode template
      if (uploadedFile.includes('dev-mode-template')) {
        return `/template_images/${uploadedFile}`;
      }
      // Persisted uploads are served through authenticated API routes.
      const encodedPath = uploadedFile.split('/').map(segment => encodeURIComponent(segment)).join('/');
      return `/api/files/temp_images/${encodedPath}`;
    }
    
    return null;
  }, [uploadedFile, uploadedFileUrl, localBlobUrl]);

  // Generate PDF client-side
  const generatePdf = useCallback(async () => {
    if (!isClientSupported || !generatorRef.current || !uploadedFile) {
      console.error('Client-side PDF generation not available');
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setStage('Initializing');
    individualGenerationSequenceRef.current += 1;
    setIsGeneratingIndividual(false);
    cleanupBlobUrls();

    try {
      const containerElement = document.querySelector('.image-container img') as HTMLImageElement;
      const uiContainerDimensions = containerElement
        ? { width: containerElement.offsetWidth, height: containerElement.offsetHeight }
        : { width: 600, height: 400 };

      const templateUrl = getTemplateUrl();
      if (!templateUrl) {
        throw new Error('No template URL available');
      }

      const preparedData = prepareDataForClient();
      const preparedPositions = preparePositionsForClient();
      
      console.log('Client: Generating single PDF', {
        entries: preparedData.length,
        hasPositions: !!preparedPositions,
        templateUrl,
        mode: 'single'
      });

      const result = await generatorRef.current.generate({
        templateUrl,
        entries: preparedData,
        positions: preparedPositions,
        uiContainerDimensions,
        mode: 'single'
      });

      console.log('Client: Generation result', {
        success: result.success,
        mode: result.mode,
        hasData: !!result.data,
        dataSize: result.data?.byteLength,
        error: result.error
      });

      if (result.success && result.data) {
        const blobUrl = ClientPdfGenerator.createBlobUrl(result.data);
        blobUrlsRef.current.push(blobUrl);
        setGeneratedPdfUrl(blobUrl);
        setPdfDownloadUrl(blobUrl);
      } else {
        throw result.error || new Error('PDF generation failed');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(error instanceof Error ? error.message : 'Error generating PDF');
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setStage('');
    }
  }, [
    isClientSupported,
    uploadedFile,
    getTemplateUrl,
    prepareDataForClient,
    preparePositionsForClient,
    cleanupBlobUrls
  ]);

  // Generate individual PDFs client-side
  const generateIndividualPdfs = useCallback(async () => {
    if (!isClientSupported || !generatorRef.current || !uploadedFile) {
      console.error('Client-side PDF generation not available');
      return;
    }

    setIsGeneratingIndividual(true);
    setProgress(0);
    setStage('Initializing');
    const generationSequence = ++individualGenerationSequenceRef.current;
    cleanupBlobUrls();
    setIndividualPdfsData(null);

    const receivedFiles: PdfFile[] = [];
    const partialBlobUrls: string[] = [];
    const revokePartialBlobUrls = () => {
      const partialUrls = new Set(partialBlobUrls);
      partialBlobUrls.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = blobUrlsRef.current.filter(
        (url) => !partialUrls.has(url)
      );
    };

    try {
      const containerElement = document.querySelector('.image-container img') as HTMLImageElement;
      const uiContainerDimensions = containerElement
        ? { width: containerElement.offsetWidth, height: containerElement.offsetHeight }
        : { width: 600, height: 400 };

      const templateUrl = getTemplateUrl();
      if (!templateUrl) {
        throw new Error('No template URL available');
      }

      const result = await generatorRef.current.generate({
        templateUrl,
        entries: prepareDataForClient(),
        positions: preparePositionsForClient(),
        uiContainerDimensions,
        mode: 'individual',
        namingColumn: selectedNamingColumn,
        onFile: (file) => {
          if (individualGenerationSequenceRef.current !== generationSequence) {
            return;
          }

          const dataBuffer =
            file.data.byteOffset === 0 &&
            file.data.byteLength === file.data.buffer.byteLength
              ? (file.data.buffer as ArrayBuffer)
              : file.data.slice().buffer;
          const blob = new Blob([dataBuffer], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          partialBlobUrls.push(url);
          blobUrlsRef.current.push(url);
          receivedFiles.push({
            filename: file.filename,
            url,
            originalIndex: file.originalIndex,
            blob
          });
        }
      });

      if (individualGenerationSequenceRef.current !== generationSequence) {
        revokePartialBlobUrls();
        return;
      }

      if (result.success) {
        if (receivedFiles.length !== tableData.length) {
          throw new Error(
            `Expected ${tableData.length} PDFs but received ${receivedFiles.length}`
          );
        }

        receivedFiles.sort((a, b) => a.originalIndex - b.originalIndex);

        // Set initial naming column if needed
        if (tableData.length > 0 && !selectedNamingColumn) {
          setSelectedNamingColumn(Object.keys(tableData[0])[0]);
        }

        setIndividualPdfsData(receivedFiles);
      } else {
        throw result.error || new Error('PDF generation failed');
      }
    } catch (error) {
      revokePartialBlobUrls();
      if (individualGenerationSequenceRef.current !== generationSequence) {
        return;
      }
      console.error('Error generating individual PDFs:', error);
      alert(error instanceof Error ? error.message : 'Error generating PDFs');
    } finally {
      if (individualGenerationSequenceRef.current === generationSequence) {
        setIsGeneratingIndividual(false);
        setProgress(0);
        setStage('');
      }
    }
  }, [
    isClientSupported,
    uploadedFile,
    selectedNamingColumn,
    tableData,
    setSelectedNamingColumn,
    getTemplateUrl,
    prepareDataForClient,
    preparePositionsForClient,
    cleanupBlobUrls
  ]);

  // Download PDF
  const handleDownloadPdf = useCallback(() => {
    if (pdfDownloadUrl && generatedPdfUrl) {
      // For client-generated PDFs, we can download directly
      const a = document.createElement('a');
      a.href = pdfDownloadUrl;
      a.download = 'generated_certificates.pdf';
      a.click();
    }
  }, [pdfDownloadUrl, generatedPdfUrl]);

  // Clear PDF data
  const clearPdfData = useCallback(() => {
    individualGenerationSequenceRef.current += 1;
    cleanupBlobUrls();
    setGeneratedPdfUrl(null);
    setPdfDownloadUrl(null);
    setIndividualPdfsData(null);
    setIsGenerating(false);
    setIsGeneratingIndividual(false);
    setProgress(0);
    setStage('');
  }, [cleanupBlobUrls]);

  // Get capability report
  const getCapabilityReport = useCallback(async () => {
    if (!featureDetectorRef.current) {
      return 'Feature detector not initialized';
    }
    return featureDetectorRef.current.getCapabilityReport();
  }, []);

  // Check if can handle data size
  const canHandleDataSize = useCallback(async (rowCount: number) => {
    if (!featureDetectorRef.current) {
      return false;
    }
    return featureDetectorRef.current.canHandleDataSize(rowCount);
  }, []);

  const assessIndividualCapacity = useCallback(async () => {
    const detector = featureDetectorRef.current || FeatureDetector.getInstance();
    const memory = await detector.getMemoryInfo();
    const visiblePositions = Object.values(positions).filter(
      (position) => position.isVisible !== false
    );
    const standardFonts = new Set(['Helvetica', 'Times', 'Courier']);
    const customFontCount = new Set(
      visiblePositions
        .map((position) => position.fontFamily)
        .filter(
          (fontFamily): fontFamily is NonNullable<typeof fontFamily> =>
            !!fontFamily && !standardFonts.has(fontFamily)
        )
    ).size;

    return assessIndividualPdfCapacity({
      rowCount: tableData.length,
      templateBytes: estimateTemplateBytes(
        localPdfByteLength,
        uploadedFile instanceof File ? uploadedFile : null
      ),
      visibleFieldCount: visiblePositions.length,
      customFontCount,
      memory
    });
  }, [localPdfByteLength, positions, tableData.length, uploadedFile]);

  return {
    isClientSupported,
    isGenerating,
    isGeneratingIndividual,
    progress,
    stage,
    generatedPdfUrl,
    pdfDownloadUrl,
    individualPdfsData,
    generatePdf,
    generateIndividualPdfs,
    handleDownloadPdf,
    clearPdfData,
    getCapabilityReport,
    canHandleDataSize,
    assessIndividualCapacity
  };
}
