import { useState, useEffect, useCallback } from "react";

export interface UsePreviewReturn {
  currentPreviewIndex: number;
  isPreviewLoading: boolean;
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
  setCurrentPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function usePreview(totalEntries: number, numTextFields: number = 0): UsePreviewReturn {
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  // Reset preview index when total entries changes
  useEffect(() => {
    if (totalEntries > 0) {
      setCurrentPreviewIndex(0);
    }
  }, [totalEntries]);

  // Helper function to handle preview loading for complex layouts
  const handlePreviewChange = useCallback(async (newIndex: number) => {
    // Show loading state for complex previews (many text fields)
    if (numTextFields > 10) {
      setIsPreviewLoading(true);
      // Small delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    setCurrentPreviewIndex(newIndex);
    
    if (numTextFields > 10) {
      // Brief delay to ensure smooth transition
      await new Promise(resolve => setTimeout(resolve, 50));
      setIsPreviewLoading(false);
    }
  }, [numTextFields]);

  // Navigation functions
  const goToFirst = useCallback(() => {
    handlePreviewChange(0);
  }, [handlePreviewChange]);

  const goToPrevious = useCallback(() => {
    const newIndex = Math.max(0, currentPreviewIndex - 1);
    handlePreviewChange(newIndex);
  }, [currentPreviewIndex, handlePreviewChange]);

  const goToNext = useCallback(() => {
    const newIndex = Math.min(totalEntries - 1, currentPreviewIndex + 1);
    handlePreviewChange(newIndex);
  }, [totalEntries, currentPreviewIndex, handlePreviewChange]);

  const goToLast = useCallback(() => {
    handlePreviewChange(totalEntries - 1);
  }, [totalEntries, handlePreviewChange]);

  return {
    currentPreviewIndex,
    isPreviewLoading,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    setCurrentPreviewIndex,
  };
}