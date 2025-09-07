import { useCallback, useEffect } from "react";
import { PROGRESSIVE_PDF } from "@/utils/constants";
import type { TableData } from "@/types/certificate";

interface UsePdfGenerationMethodsProps {
  // Feature flags
  isDevelopment: boolean;
  devMode: boolean;
  isClientSupported: boolean;
  
  // Data
  tableData: TableData[];
  localBlobUrl: string | null;
  uploadedFileUrl: string | null;
  uploadedFile: File | string | null;
  
  // Server-side generation functions
  generatePdf: () => Promise<void>;
  generateIndividualPdfs: (overrideFilename?: string) => Promise<void>;
  startProgressiveGeneration: (mode: "individual" | "bulk", batchSize?: number, overrideFilename?: string) => Promise<void>;
  setGeneratedPdfUrl: (url: string | null) => void;
  setIndividualPdfsData: (data: any) => void;
  
  // Client-side generation functions
  generateClientPdf: () => Promise<void>;
  generateClientIndividualPdfs: () => Promise<void>;
  clientGeneratedPdfUrl: string | null;
  clientIndividualPdfsData: any;
  
  // File upload
  uploadToServer: () => Promise<any>;
}

interface UsePdfGenerationMethodsReturn {
  handleGeneratePdf: (useServer?: boolean) => Promise<void>;
  handleGenerateIndividualPdfs: (useServer?: boolean) => Promise<void>;
}

export function usePdfGenerationMethods({
  isDevelopment,
  devMode,
  isClientSupported,
  tableData,
  localBlobUrl,
  uploadedFileUrl,
  uploadedFile,
  generatePdf,
  generateIndividualPdfs,
  startProgressiveGeneration,
  setGeneratedPdfUrl,
  setIndividualPdfsData,
  generateClientPdf,
  generateClientIndividualPdfs,
  clientGeneratedPdfUrl,
  clientIndividualPdfsData,
  uploadToServer
}: UsePdfGenerationMethodsProps): UsePdfGenerationMethodsReturn {
  
  // Transfer client-generated PDF URLs to main state when they change
  useEffect(() => {
    if (clientGeneratedPdfUrl) {
      console.log("Transferring client PDF URL to main state:", clientGeneratedPdfUrl);
      setGeneratedPdfUrl(clientGeneratedPdfUrl);
    }
  }, [clientGeneratedPdfUrl, setGeneratedPdfUrl]);

  useEffect(() => {
    if (clientIndividualPdfsData) {
      console.log("Transferring client individual PDFs to main state:", clientIndividualPdfsData.length, "files");
      setIndividualPdfsData(clientIndividualPdfsData);
    }
  }, [clientIndividualPdfsData, setIndividualPdfsData]);

  // Helper function to determine PDF generation method
  const getPdfGenerationMethod = useCallback(({
    useServer,
    forceServer = false
  }: {
    useServer: boolean;
    forceServer?: boolean;
  }): "server" | "client" => {
    // Priority 1: Explicit server request in dev mode
    if (useServer && isDevelopment && devMode) {
      return "server";
    }
    // Priority 2: Client-side if supported and not forced to server
    if (isClientSupported && !forceServer) {
      return "client";
    }
    // Priority 3: Fallback to server
    return "server";
  }, [isDevelopment, devMode, isClientSupported]);

  // Helper function to ensure file is uploaded for server-side generation
  const ensureFileUploadedForServer = useCallback(async (): Promise<string | null> => {
    if (localBlobUrl && !/^https?:\/\//i.test(uploadedFileUrl || '')) {
      console.log('Uploading file to server for server-side generation...');
      const uploadResult = await uploadToServer();
      if (uploadResult && uploadResult.filename) {
        console.log('File uploaded successfully, filename:', uploadResult.filename);
        return uploadResult.filename;
      }
    }
    // File was already uploaded or is a string
    return typeof uploadedFile === 'string' ? uploadedFile : null;
  }, [localBlobUrl, uploadedFileUrl, uploadToServer, uploadedFile]);

  // Helper function to handle upload failures
  const handleUploadFailure = useCallback(() => {
    console.error('Failed to get uploaded filename');
    alert('Failed to get uploaded filename. Please try again.');
  }, []);

  const handleGeneratePdf = useCallback(async (useServer = false) => {
    const method = getPdfGenerationMethod({ useServer, forceServer: false });
    
    if (method === "server") {
      const reason = useServer && isDevelopment && devMode ? "(Dev Mode)" : "(Fallback)";
      console.log(`📡 Using SERVER-SIDE PDF generation ${reason}`);
      const uploadedFilename = await ensureFileUploadedForServer();
      
      if (!uploadedFilename) {
        handleUploadFailure();
        return;
      }
      
      // Note: generatePdf doesn't take a filename parameter currently
      // It uses the state value, but ensureFileUploadedForServer ensures it's updated
      await generatePdf();
    } else {
      console.log("🚀 Using CLIENT-SIDE PDF generation");
      await generateClientPdf();
    }
  }, [
    getPdfGenerationMethod,
    isDevelopment,
    devMode,
    ensureFileUploadedForServer,
    handleUploadFailure,
    generateClientPdf,
    generatePdf
  ]);

  const handleGenerateIndividualPdfs = useCallback(async (useServer = false) => {
    const method = getPdfGenerationMethod({ useServer, forceServer: false });
    const isProgressive = tableData.length > PROGRESSIVE_PDF.AUTO_PROGRESSIVE_THRESHOLD;
    
    if (method === "server") {
      const reason = useServer && isDevelopment && devMode ? "(Dev Mode)" : "(Fallback)";
      // Ensure file is uploaded and get the correct filename
      const uploadedFilename = await ensureFileUploadedForServer();
      
      if (!uploadedFilename) {
        handleUploadFailure();
        return;
      }
      
      if (isProgressive) {
        console.log(`📡 Using PROGRESSIVE SERVER-SIDE generation for ${tableData.length} rows ${reason}`);
        await startProgressiveGeneration('individual', 20, uploadedFilename);
      } else {
        console.log(`📡 Using SERVER-SIDE generation for ${tableData.length} rows ${reason}`);
        await generateIndividualPdfs(uploadedFilename);
      }
    } else {
      console.log(`🚀 Using CLIENT-SIDE generation for ${tableData.length} rows`);
      if (isProgressive) {
        console.log(`   ℹ️ Large dataset (${tableData.length} rows) - client-side handles this efficiently`);
      }
      await generateClientIndividualPdfs();
      // Note: Results are automatically set in clientIndividualPdfsData
    }
  }, [
    getPdfGenerationMethod,
    tableData.length,
    isDevelopment,
    devMode,
    ensureFileUploadedForServer,
    handleUploadFailure,
    startProgressiveGeneration,
    generateIndividualPdfs,
    generateClientIndividualPdfs
  ]);

  return {
    handleGeneratePdf,
    handleGenerateIndividualPdfs
  };
}