/**
 * PDF Generation Methods Hook
 * 
 * This hook manages the logic for choosing between client-side and server-side PDF generation.
 * 
 * Philosophy: CLIENT-FIRST
 * - Client-side generation is the DEFAULT when supported
 * - Server-side is only used as a fallback or when explicitly requested in Dev Mode
 * - This reduces server load and improves performance
 * 
 * When server-side is used:
 * 1. Browser doesn't support client-side generation (no Web Workers, insufficient memory)
 * 2. Explicitly requested via Dev Mode buttons (for testing/comparison)
 * 3. The individual batch exceeds the browser's capacity budget
 */
import { useCallback, useEffect } from "react";
import { PROGRESSIVE_PDF } from "@/utils/constants";
import type { TableData } from "@/types/certificate";
import type { CapacityDecision } from "@/lib/pdf/client/individual-capacity";

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
  assessClientIndividualCapacity: () => Promise<CapacityDecision>;
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
  assessClientIndividualCapacity,
  clientGeneratedPdfUrl,
  clientIndividualPdfsData,
  uploadToServer
}: UsePdfGenerationMethodsProps): UsePdfGenerationMethodsReturn {
  
  // Transfer client-generated PDF URLs to main state when they change
  useEffect(() => {
    if (clientGeneratedPdfUrl) {
      setGeneratedPdfUrl(clientGeneratedPdfUrl);
    }
  }, [clientGeneratedPdfUrl, setGeneratedPdfUrl]);

  useEffect(() => {
    if (clientIndividualPdfsData) {
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
    // Priority 1: Explicit server request in dev mode (for testing)
    if (useServer && isDevelopment && devMode) {
      return "server";
    }
    // Priority 2: Forced to server (legacy compatibility)
    if (forceServer) {
      return "server";
    }
    // Priority 3: Use client-side if supported
    if (isClientSupported) {
      return "client";
    }
    // Priority 4: Fallback to server when client not supported
    return "server";
  }, [isDevelopment, devMode, isClientSupported]);

  // Helper function to ensure file is uploaded for server-side generation
  const ensureFileUploadedForServer = useCallback(async (): Promise<string | null> => {
    if (localBlobUrl && !/^https?:\/\//i.test(uploadedFileUrl || '')) {
      const uploadResult = await uploadToServer();
      if (uploadResult && uploadResult.filename) {
        return uploadResult.filename;
      }
    }
    // File was already uploaded or is a string
    return typeof uploadedFile === 'string' ? uploadedFile : null;
  }, [localBlobUrl, uploadedFileUrl, uploadToServer, uploadedFile]);

  // Helper function to handle upload failures
  const handleUploadFailure = useCallback(() => {
    console.error('Failed to get uploaded filename');
    alert("We couldn't upload your certificate template to the server. Check your connection and try again.");
  }, []);

  const handleGeneratePdf = useCallback(async (useServer = false) => {
    const method = getPdfGenerationMethod({ useServer, forceServer: false });
    
    if (method === "server") {
      const uploadedFilename = await ensureFileUploadedForServer();
      
      if (!uploadedFilename) {
        handleUploadFailure();
        return;
      }

      // generatePdf reads the uploaded filename from state, which
      // ensureFileUploadedForServer has just updated.
      await generatePdf();
    } else {
      await generateClientPdf();
    }
  }, [
    getPdfGenerationMethod,
    ensureFileUploadedForServer,
    handleUploadFailure,
    generateClientPdf,
    generatePdf
  ]);

  const handleGenerateIndividualPdfs = useCallback(async (useServer = false) => {
    let method = getPdfGenerationMethod({ useServer, forceServer: false });
    const isProgressive = tableData.length > PROGRESSIVE_PDF.AUTO_PROGRESSIVE_THRESHOLD;

    if (method === "client") {
      try {
        const capacity = await assessClientIndividualCapacity();
        if (!capacity.allowed) {
          method = "server";
        }
      } catch (error) {
        console.warn("Could not assess client PDF capacity; using server fallback", error);
        method = "server";
      }
    }
    
    if (method === "server") {
      const uploadedFilename = await ensureFileUploadedForServer();
      
      if (!uploadedFilename) {
        handleUploadFailure();
        return;
      }
      
      if (isProgressive) {
        await startProgressiveGeneration('individual', 20, uploadedFilename);
      } else {
        await generateIndividualPdfs(uploadedFilename);
      }
    } else {
      // Results arrive via clientIndividualPdfsData (see effect above).
      await generateClientIndividualPdfs();
    }
  }, [
    getPdfGenerationMethod,
    tableData.length,
    ensureFileUploadedForServer,
    handleUploadFailure,
    startProgressiveGeneration,
    generateIndividualPdfs,
    generateClientIndividualPdfs,
    assessClientIndividualCapacity
  ]);

  return {
    handleGeneratePdf,
    handleGenerateIndividualPdfs
  };
}
