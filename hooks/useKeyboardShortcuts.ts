import { useEffect, useLayoutEffect, useRef } from "react";
import { FONT_CAPABILITIES } from "@/utils/constants";
import type { Positions } from "@/types/certificate";

/** True when keyboard input belongs to a form control rather than the canvas. */
function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.getAttribute("contenteditable") === "true" ||
    element.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null
  );
}

/**
 * True when arrow keys belong to a focused control (button, link, tab…) rather
 * than the canvas. Preview text fields are role="button" too, but they are the
 * nudge target, so they're identified by data-preview-field and allowed.
 */
function isInteractiveControl(element: Element | null): boolean {
  if (!element || element.closest("[data-preview-field]")) return false;
  return (
    element.closest(
      'button, a[href], summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="option"], [role="menuitem"]'
    ) !== null
  );
}

export interface UseKeyboardShortcutsProps {
  selectedField: string | null;
  isDragging: boolean;
  positions: Positions;
  setPositions: React.Dispatch<React.SetStateAction<Positions>>;
  onEscapePressed: () => void;
}

export function useKeyboardShortcuts({
  selectedField,
  isDragging,
  positions,
  setPositions,
  onEscapePressed
}: UseKeyboardShortcutsProps) {
  // Read positions through a ref so the format-shortcut listener isn't torn
  // down and re-attached on every position change (60x/s while dragging).
  const positionsRef = useRef(positions);
  useLayoutEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Arrow key nudging for selected field
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedField || isDragging || event.defaultPrevented) return;
      // Leave browser/OS shortcuts such as Alt+Left alone
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      // Don't nudge while a form control, button, menu or dialog has focus
      if (
        isEditableElement(document.activeElement) ||
        isInteractiveControl(document.activeElement)
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
              y: Math.max(0, (prev[selectedField]?.y ?? 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowDown":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              y: Math.min(100, (prev[selectedField]?.y ?? 50) + nudgeAmount)
            }
          }));
          break;
        case "ArrowLeft":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.max(0, (prev[selectedField]?.x ?? 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowRight":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.min(100, (prev[selectedField]?.x ?? 50) + nudgeAmount)
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
      // Modals handle Escape themselves and mark the event as handled
      if (event.key === "Escape" && !event.defaultPrevented) {
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
      // Let text fields keep their own Ctrl/Cmd+B/I behaviour
      if (isEditableElement(document.activeElement)) return;

      const currentFont = positionsRef.current[selectedField]?.fontFamily || "Helvetica";
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
  }, [selectedField, setPositions]);
}
