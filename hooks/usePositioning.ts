import { useState, useEffect, useCallback } from "react";
import { DEFAULT_FONT_SIZE } from "@/utils/constants";
import type { TableData, Position, Positions, TextAlignment } from "@/types/certificate";

export interface UsePositioningProps {
  tableData: TableData[];
}

export interface UsePositioningReturn {
  positions: Positions;
  setPositions: React.Dispatch<React.SetStateAction<Positions>>;
  changeAlignment: (key: string, newAlignment: TextAlignment) => void;
  clearPositions: () => void;
}

export function usePositioning({ tableData }: UsePositioningProps): UsePositioningReturn {
  const [positions, setPositions] = useState<Positions>({});

  // Ensure all table columns have positions
  useEffect(() => {
    if (tableData.length > 0) {
      setPositions((prevPositions) => {
        const newPositions = { ...prevPositions };
        let hasNewPositions = false;

        Object.keys(tableData[0]).forEach((key, index) => {
          if (!newPositions[key]) {
            // Check if this is an email field
            const isEmailField =
              key.toLowerCase().includes("email") ||
              key.toLowerCase().includes("e-mail") ||
              key.toLowerCase().includes("mail");

            newPositions[key] = {
              x: 50,
              y: 50 + index * 10,
              fontSize: DEFAULT_FONT_SIZE,
              fontFamily: "Helvetica",
              color: "#000000",
              alignment: "center",
              isVisible: !isEmailField, // Hide email fields by default
              width: 90, // Default to 90% width
              textMode: "shrink", // Default to shrink-to-fit mode
              lineHeight: 1.2
            };
            hasNewPositions = true;
          }
        });

        return hasNewPositions ? newPositions : prevPositions;
      });
    }
  }, [tableData]);

  // Helper function to change alignment while keeping visual position
  const changeAlignment = useCallback(
    (key: string, newAlignment: TextAlignment) => {
      setPositions((prev) => {
        const currentPos = prev[key];
        if (!currentPos) return prev;

        const currentAlignment = currentPos.alignment || "left";
        if (currentAlignment === newAlignment) return prev;

        // Get the text element to measure actual width
        const textElement = document.querySelector(
          `[data-key="${key}"]`
        ) as HTMLElement;
        if (!textElement) {
          // Fallback: just change alignment without position adjustment
          return {
            ...prev,
            [key]: { ...currentPos, alignment: newAlignment }
          };
        }

        const containerElement = document.querySelector(
          ".image-container img"
        ) as HTMLImageElement;
        if (!containerElement) {
          return {
            ...prev,
            [key]: { ...currentPos, alignment: newAlignment }
          };
        }

        // Get actual text width in pixels
        const textRect = textElement.getBoundingClientRect();
        const containerRect = containerElement.getBoundingClientRect();
        const textWidthPercent = (textRect.width / containerRect.width) * 100;

        let xAdjustment = 0;

        // Calculate position adjustment to keep text visually in same place
        if (currentAlignment === "left" && newAlignment === "center") {
          xAdjustment = textWidthPercent / 2;
        } else if (currentAlignment === "left" && newAlignment === "right") {
          xAdjustment = textWidthPercent;
        } else if (currentAlignment === "center" && newAlignment === "left") {
          xAdjustment = -textWidthPercent / 2;
        } else if (currentAlignment === "center" && newAlignment === "right") {
          xAdjustment = textWidthPercent / 2;
        } else if (currentAlignment === "right" && newAlignment === "left") {
          xAdjustment = -textWidthPercent;
        } else if (currentAlignment === "right" && newAlignment === "center") {
          xAdjustment = -textWidthPercent / 2;
        }

        const newX = Math.max(0, Math.min(100, currentPos.x + xAdjustment));

        return {
          ...prev,
          [key]: {
            ...currentPos,
            alignment: newAlignment,
            x: newX
          }
        };
      });
    },
    []
  );

  const clearPositions = useCallback(() => {
    setPositions({});
  }, []);

  return {
    positions,
    setPositions,
    changeAlignment,
    clearPositions,
  };
}