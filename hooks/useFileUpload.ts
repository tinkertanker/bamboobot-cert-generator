import { useState, useCallback } from "react";

export interface UseFileUploadReturn {
  uploadedFile: File | string | null;
  uploadedFileUrl: string | null;
  isLoading: boolean;
  isDraggingFile: boolean;
  setUploadedFile: (file: File | string | null) => void;
  setUploadedFileUrl: (url: string | null) => void;
  processFile: (file: File) => Promise<void>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFileDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  clearFile: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [uploadedFile, setUploadedFile] = useState<File | string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const processFile = useCallback(async (file: File) => {
    if (file && (file.type === "image/jpeg" || file.type === "image/png")) {
      setUploadedFile(file);
      setIsLoading(true);
      const formData = new FormData();
      formData.append("template", file);
      console.log("Uploading file to API...");
      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        const data = await response.json();
        console.log(data.message);
        setUploadedFile(data.filename);
        setUploadedFileUrl(data.image);
      } catch (error) {
        console.error("Error uploading file:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("Please upload a JPEG or PNG file.");
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
  }, []);

  return {
    uploadedFile,
    uploadedFileUrl,
    isLoading,
    isDraggingFile,
    setUploadedFile,
    setUploadedFileUrl,
    processFile,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleFileDrop,
    clearFile,
  };
}