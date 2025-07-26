import { useEffect } from "react";
import { FONT_CAPABILITIES } from "@/utils/constants";

export interface UseKeyboardShortcutsProps {
  selectedField: string | null;
  isDragging: boolean;
  positions: { [key: string]: any };
  setPositions: React.Dispatch<React.SetStateAction<{ [key: string]: any }>>;
  onEscapePressed: () => void;
}

export function useKeyboardShortcuts({
  selectedField,
  isDragging,
  positions,
  setPositions,
  onEscapePressed
}: UseKeyboardShortcutsProps) {
  // Arrow key nudging for selected field
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedField || isDragging) return;

      // Don't nudge if an input, textarea, or contenteditable element has focus
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const nudgeAmount = event.shiftKey ? 2 : 0.5; // Larger nudge with Shift

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              y: Math.max(0, (prev[selectedField]?.y || 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowDown":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              y: Math.min(100, (prev[selectedField]?.y || 50) + nudgeAmount)
            }
          }));
          break;
        case "ArrowLeft":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.max(0, (prev[selectedField]?.x || 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowRight":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.min(100, (prev[selectedField]?.x || 50) + nudgeAmount)
            }
          }));
          break;
      }
    };

    if (selectedField) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedField, isDragging, setPositions]);

  // ESC key to dismiss all modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapePressed();
      }
    };

    document.addEventListener("keydown", handleEscKey);
    return () => document.removeEventListener("keydown", handleEscKey);
  }, [onEscapePressed]);

  // Bold/Italic keyboard shortcuts (Ctrl/Cmd+B for bold, Ctrl/Cmd+I for italic)
  useEffect(() => {
    const handleFormatShortcuts = (event: KeyboardEvent) => {
      if (!selectedField) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCommandPressed = isMac ? event.metaKey : event.ctrlKey;

      if (!isCommandPressed) return;

      const currentFont = positions[selectedField]?.fontFamily || "Helvetica";
      const fontCapabilities = FONT_CAPABILITIES[currentFont as keyof typeof FONT_CAPABILITIES];

      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        if (fontCapabilities.bold) {
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              bold: !prev[selectedField]?.bold
            }
          }));
        }
      } else if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        if (fontCapabilities.italic) {
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              italic: !prev[selectedField]?.italic
            }
          }));
        }
      }
    };

    if (selectedField) {
      document.addEventListener("keydown", handleFormatShortcuts);
      return () =>
        document.removeEventListener("keydown", handleFormatShortcuts);
    }
  }, [selectedField, positions, setPositions]);
}