import { useState, useEffect, useCallback } from "react";
import type { Positions } from "./usePositioning";

export interface DragInfo {
  key: string;
  offsetX: number;
  offsetY: number;
  pointerId: number;
}

export interface UseDragAndDropProps {
  positions: Positions;
  setPositions: React.Dispatch<React.SetStateAction<Positions>>;
  setSelectedField: (field: string | null) => void;
  setActiveTab: (tab: "data" | "formatting" | "email") => void;
}

export interface UseDragAndDropReturn {
  isDragging: boolean;
  dragInfo: DragInfo | null;
  showCenterGuide: { horizontal: boolean; vertical: boolean };
  setShowCenterGuide: React.Dispatch<React.SetStateAction<{ horizontal: boolean; vertical: boolean }>>;
  handlePointerDown: (event: React.PointerEvent, key: string) => void;
  handlePointerUp: (event: React.PointerEvent) => void;
  clearDragState: () => void;
}

export function useDragAndDrop({
  positions,
  setPositions,
  setSelectedField,
  setActiveTab
}: UseDragAndDropProps): UseDragAndDropReturn {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [showCenterGuide, setShowCenterGuide] = useState<{
    horizontal: boolean;
    vertical: boolean;
  }>({ horizontal: false, vertical: false });

  // Global pointer event handlers for smooth dragging
  useEffect(() => {
    const handleGlobalPointerMove = (event: PointerEvent) => {
      if (!isDragging || !dragInfo) return;

      const imageContainer = document.querySelector(".image-container");
      if (imageContainer) {
        const containerRect = imageContainer.getBoundingClientRect();

        // Calculate position accounting for initial offset
        const x =
          ((event.clientX - dragInfo.offsetX - containerRect.left) /
            containerRect.width) *
          100;
        const y =
          ((event.clientY - dragInfo.offsetY - containerRect.top) /
            containerRect.height) *
          100;

        // Define the threshold (e.g., 10% from the edge)
        const threshold = 10;

        if (
          x < -threshold ||
          x > 100 + threshold ||
          y < -threshold ||
          y > 100 + threshold
        ) {
          // If dragged too far, reset to center but preserve other properties
          setPositions((prev) => ({
            ...prev,
            [dragInfo.key]: { ...prev[dragInfo.key], x: 50, y: 50 }
          }));
        } else {
          // Clamp the values between 0 and 100 but preserve other properties
          let clampedX = Math.max(0, Math.min(100, x));
          let clampedY = Math.max(0, Math.min(100, y));

          // Center snapping - snap to center if within 2% threshold (closer to the line)
          const snapThreshold = 2;
          const centerX = 50;
          const centerY = 50;

          let isSnappingHorizontal = false;
          let isSnappingVertical = false;

          if (Math.abs(clampedX - centerX) <= snapThreshold) {
            clampedX = centerX;
            isSnappingVertical = true; // Show vertical line when snapping to X center
          }
          if (Math.abs(clampedY - centerY) <= snapThreshold) {
            clampedY = centerY;
            isSnappingHorizontal = true; // Show horizontal line when snapping to Y center
          }

          // Show/hide center guides based on which axis is snapping
          setShowCenterGuide({
            horizontal: isSnappingHorizontal,
            vertical: isSnappingVertical
          });

          setPositions((prev) => ({
            ...prev,
            [dragInfo.key]: { ...prev[dragInfo.key], x: clampedX, y: clampedY }
          }));
        }
      }
    };

    const handleGlobalPointerUp = (event: PointerEvent) => {
      if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId)
        return;

      setIsDragging(false);
      setDragInfo(null);
      setShowCenterGuide({ horizontal: false, vertical: false });
    };

    if (isDragging) {
      document.addEventListener("pointermove", handleGlobalPointerMove);
      document.addEventListener("pointerup", handleGlobalPointerUp);
      document.addEventListener("pointercancel", handleGlobalPointerUp);

      return () => {
        document.removeEventListener("pointermove", handleGlobalPointerMove);
        document.removeEventListener("pointerup", handleGlobalPointerUp);
        document.removeEventListener("pointercancel", handleGlobalPointerUp);
      };
    }
  }, [isDragging, dragInfo, setPositions]);

  // Cleanup drag state on unmount
  useEffect(() => {
    return () => {
      if (isDragging) {
        setIsDragging(false);
        setDragInfo(null);
      }
    };
  }, [isDragging]);

  // Pointer event handlers for precise dragging
  const handlePointerDown = useCallback(
    (event: React.PointerEvent, key: string) => {
      event.preventDefault();

      // Select the field for formatting and switch to formatting tab
      setSelectedField(key);
      setActiveTab("formatting");
      setShowCenterGuide({ horizontal: false, vertical: false });

      const element = event.currentTarget as HTMLElement;
      const rect = element.getBoundingClientRect();

      // Get current alignment to calculate correct anchor point
      const currentAlignment = positions[key]?.alignment || "left";

      // Calculate anchor point based on alignment
      let anchorX: number;
      if (currentAlignment === "center") {
        anchorX = rect.left + rect.width / 2;
      } else if (currentAlignment === "right") {
        anchorX = rect.right;
      } else {
        // left alignment
        anchorX = rect.left;
      }

      // Calculate offset from the alignment anchor point
      const offsetX = event.clientX - anchorX;
      const offsetY = event.clientY - (rect.top + rect.height / 2);

      setDragInfo({
        key,
        offsetX,
        offsetY,
        pointerId: event.pointerId
      });
      setIsDragging(true);

      // Capture pointer for smooth dragging
      element.setPointerCapture(event.pointerId);
    },
    [positions, setSelectedField, setActiveTab]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId)
        return;

      event.preventDefault();

      setIsDragging(false);
      setDragInfo(null);

      // Release pointer capture
      const element = event.currentTarget as HTMLElement;
      element.releasePointerCapture(event.pointerId);
    },
    [isDragging, dragInfo]
  );

  const clearDragState = useCallback(() => {
    setIsDragging(false);
    setDragInfo(null);
    setShowCenterGuide({ horizontal: false, vertical: false });
  }, []);

  return {
    isDragging,
    dragInfo,
    showCenterGuide,
    setShowCenterGuide,
    handlePointerDown,
    handlePointerUp,
    clearDragState,
  };
}