import { useState, useCallback } from "react";
import { ERROR_MESSAGES } from "@/utils/errorMessages";
import { ImageToPdfConverter } from "@/lib/pdf/client/image-to-pdf";

export interface UseFileUploadReturn {
  uploadedFile: File | string | null;
  uploadedFileUrl: string | null;
  localBlobUrl: string | null;  // New: blob URL for local file access
  isLoading: boolean;
  isDraggingFile: boolean;
  uploadError: { title: string; message: string; action: string } | null;
  setUploadedFile: (file: File | string | null) => void;
  setUploadedFileUrl: (url: string | null) => void;
  processFile: (file: File, isTemplate?: boolean, skipUpload?: boolean) => Promise<void>;
  uploadToServer: () => Promise<{ image: string; filename: string } | undefined>;  // New: explicitly upload when needed
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFileDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  clearFile: () => void;
  clearError: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [uploadedFile, setUploadedFile] = useState<File | string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<{ title: string; message: string; action: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingIsTemplate, setPendingIsTemplate] = useState<boolean>(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const uploadToServerInternal = useCallback(async () => {
    const file = pendingFile || (uploadedFile instanceof File ? uploadedFile : null);
    if (!file) {
      console.log("No file to upload to server");
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append("template", file);
    formData.append("isTemplate", pendingIsTemplate.toString());
    
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Template uploaded to server", { 
        isTemplate: data.isTemplate, 
        storageType: data.storageType,
        serverUrl: data.image 
      });
      setUploadedFile(data.filename);
      setUploadedFileUrl(data.image);
      return data;
    } catch (error) {
      console.error("Error uploading to server:", error);
      setUploadError(ERROR_MESSAGES.UPLOAD_FAILED);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [pendingFile, pendingIsTemplate, uploadedFile]);

  const processFile = useCallback(async (file: File, isTemplate = false, skipUpload = false) => {
    setUploadError(null);
    
    // Check file type
    if (!file || (file.type !== "image/jpeg" && file.type !== "image/png")) {
      setUploadError(ERROR_MESSAGES.INVALID_FILE_TYPE);
      return;
    }
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError(ERROR_MESSAGES.FILE_TOO_LARGE);
      return;
    }
    
    // Store original file
    setUploadedFile(file);
    setPendingFile(file);
    setPendingIsTemplate(isTemplate);
    
    // Clean up previous blob URL
    if (localBlobUrl) {
      URL.revokeObjectURL(localBlobUrl);
    }
    
    try {
      // Convert image to PDF for client-side generation
      console.log("Converting image to PDF for client-side use...");
      const pdfBlob = await ImageToPdfConverter.convertImageToPdf(file);
      setPdfBlob(pdfBlob);
      
      // Create blob URL for the PDF (for client-side generation)
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);
      setLocalBlobUrl(pdfBlobUrl);
      
      // Create blob URL for the original image (for preview)
      const imageBlobUrl = URL.createObjectURL(file);
      setUploadedFileUrl(imageBlobUrl);
      
      console.log("File ready for local processing", { 
        name: file.name, 
        type: file.type, 
        size: file.size,
        pdfBlobUrl,
        imageBlobUrl 
      });
    } catch (error) {
      console.error("Error converting image to PDF:", error);
      // Fallback: just use the original file
      const blobUrl = URL.createObjectURL(file);
      setLocalBlobUrl(blobUrl);
      setUploadedFileUrl(blobUrl);
    }
    
    // Only upload if not skipping (for client-side generation, we skip)
    if (!skipUpload) {
      await uploadToServerInternal();
    }
  }, [localBlobUrl, uploadToServerInternal]);

  const uploadToServer = useCallback(async () => {
    return uploadToServerInternal();
  }, [uploadToServerInternal]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Skip upload for client-side generation (will upload when needed)
      await processFile(file, false, true);
    }
  }, [processFile]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
  }, []);

  const handleFileDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      // Skip upload for client-side generation (will upload when needed)
      await processFile(file, false, true);
    }
  }, [processFile]);

  const clearFile = useCallback(() => {
    // Clean up blob URLs
    if (localBlobUrl) {
      URL.revokeObjectURL(localBlobUrl);
    }
    if (uploadedFileUrl && uploadedFileUrl.startsWith('blob:')) {
      URL.revokeObjectURL(uploadedFileUrl);
    }
    
    setUploadedFile(null);
    setUploadedFileUrl(null);
    setLocalBlobUrl(null);
    setPdfBlob(null);
    setPendingFile(null);
    setPendingIsTemplate(false);
    setIsDraggingFile(false);
    setUploadError(null);
  }, [localBlobUrl, uploadedFileUrl]);

  const clearError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    uploadedFile,
    uploadedFileUrl,
    localBlobUrl,
    isLoading,
    isDraggingFile,
    uploadError,
    setUploadedFile,
    setUploadedFileUrl,
    processFile,
    uploadToServer,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleFileDrop,
    clearFile,
    clearError
  };
}