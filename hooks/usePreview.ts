import { useState, useEffect, useCallback } from "react";

export interface UsePreviewReturn {
  currentPreviewIndex: number;
  goToFirst: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  goToLast: () => void;
  setCurrentPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function usePreview(totalEntries: number): UsePreviewReturn {
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(0);

  // Reset preview index when total entries changes
  useEffect(() => {
    if (totalEntries > 0) {
      setCurrentPreviewIndex(0);
    }
  }, [totalEntries]);

  // Navigation functions
  const goToFirst = useCallback(() => {
    setCurrentPreviewIndex(0);
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentPreviewIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentPreviewIndex((prev) => Math.min(totalEntries - 1, prev + 1));
  }, [totalEntries]);

  const goToLast = useCallback(() => {
    setCurrentPreviewIndex(totalEntries - 1);
  }, [totalEntries]);

  return {
    currentPreviewIndex,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    setCurrentPreviewIndex,
  };
}