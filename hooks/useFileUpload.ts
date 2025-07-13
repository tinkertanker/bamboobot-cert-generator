import { useState, useCallback } from "react";
import { ERROR_MESSAGES } from "@/utils/errorMessages";

export interface UseFileUploadReturn {
  uploadedFile: File | string | null;
  uploadedFileUrl: string | null;
  isLoading: boolean;
  isDraggingFile: boolean;
  uploadError: { title: string; message: string; action: string } | null;
  setUploadedFile: (file: File | string | null) => void;
  setUploadedFileUrl: (url: string | null) => void;
  processFile: (file: File, isTemplate?: boolean) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<{ title: string; message: string; action: string } | null>(null);

  const processFile = useCallback(async (file: File, isTemplate = false) => {
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
    
    setUploadedFile(file);
    setIsLoading(true);
    const formData = new FormData();
    formData.append("template", file);
    formData.append("isTemplate", isTemplate.toString());
    
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("Template uploaded successfully", { isTemplate: data.isTemplate, storageType: data.storageType });
      setUploadedFile(data.filename);
      setUploadedFileUrl(data.image);
    } catch (error) {
      console.error("Error uploading file:", error);
      setUploadError(ERROR_MESSAGES.UPLOAD_FAILED);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
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
      await processFile(file);
    }
  }, [processFile]);

  const clearFile = useCallback(() => {
    setUploadedFile(null);
    setUploadedFileUrl(null);
    setIsDraggingFile(false);
    setUploadError(null);
  }, []);

  const clearError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    uploadedFile,
    uploadedFileUrl,
    isLoading,
    isDraggingFile,
    uploadError,
    setUploadedFile,
    setUploadedFileUrl,
    processFile,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleFileDrop,
    clearFile,
    clearError
  };
}