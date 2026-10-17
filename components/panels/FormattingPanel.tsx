import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Select } from "@/components/ui/select";
import { DEFAULT_FONT_SIZE, FONT_CAPABILITIES } from "@/utils/constants";
import { COLORS } from "@/utils/styles";
import type { FormattingPanelProps, FontFamily } from "@/types/certificate";
import {
  X,
  Check,
  Eye,
  EyeOff,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Edit3
} from "lucide-react";

export function FormattingPanel({
  selectedField,
  setSelectedField,
  positions,
  setPositions,
  tableData,
  changeAlignment,
  showAppliedMessage,
  setShowAppliedMessage,
  setShowResetFieldModal,
  setShowClearAllModal,
  setShowCenterGuide
}: FormattingPanelProps) {
  const storedFontSize = selectedField
    ? positions[selectedField]?.fontSize || DEFAULT_FONT_SIZE
    : DEFAULT_FONT_SIZE;
  // Local draft so the size box can be cleared and retyped without snapping
  // back to the default on every keystroke.
  const [fontSizeDraft, setFontSizeDraft] = useState<string>(
    String(storedFontSize)
  );
  useEffect(() => {
    setFontSizeDraft(String(storedFontSize));
  }, [storedFontSize, selectedField]);

  const commitFontSize = (raw: string) => {
    if (!selectedField) return;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setFontSizeDraft(String(storedFontSize));
      return;
    }
    const clamped = Math.min(72, Math.max(8, parsed));
    setFontSizeDraft(String(clamped));
    setPositions((prev) => ({
      ...prev,
      [selectedField]: {
        ...prev[selectedField],
        fontSize: clamped
      }
    }));
  };

  const currentAlignment = selectedField
    ? positions[selectedField]?.alignment || "left"
    : "left";

  return (
    <div>
      {selectedField ? (
        <div className="space-y-6">
          <div
            className="flex items-center justify-between p-3 rounded-lg relative"
            style={{
              backgroundColor: COLORS.cardBg,
              border: `1px solid ${COLORS.border}`
            }}>
            <h3 className="text-sm min-w-0 truncate">
              <span className="text-gray-500 font-normal">Field:</span>{" "}
              <span className="font-medium text-gray-900">
                {selectedField}
              </span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              aria-label="Deselect field"
              title="Deselect field"
              onClick={() => {
                setSelectedField(null);
                setShowCenterGuide({
                  horizontal: false,
                  vertical: false
                });
              }}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Font, Style, Size Row */}
          <div className="grid grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
            <div>
              <label
                htmlFor="format-font"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Font
              </label>
              <Select
                id="format-font"
                value={
                  positions[selectedField]?.fontFamily || "Helvetica"
                }
                onChange={(e) => {
                  const newFontFamily = e.target.value as FontFamily;
                  const newFontCapabilities =
                    FONT_CAPABILITIES[newFontFamily];

                  setPositions((prev) => ({
                    ...prev,
                    [selectedField]: {
                      ...prev[selectedField],
                      fontFamily: newFontFamily,
                      // Clear bold/italic if the new font doesn't support them
                      ...(!newFontCapabilities.bold
                        ? { bold: false }
                        : {}),
                      ...(!newFontCapabilities.italic
                        ? { italic: false }
                        : {})
                    }
                  }));
                }}
                className="text-xs">
                <option value="Helvetica">Helvetica</option>
                <option value="Times">Times</option>
                <option value="Courier">Courier</option>
                <option disabled>──────────────</option>
                <option value="Archivo">Archivo</option>
                <option value="GreatVibes">Great Vibes</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Nunito">Nunito</option>
                <option value="Poppins">Poppins</option>
                <option value="Rubik">Rubik</option>
                <option value="SourceSansPro">Source Sans Pro</option>
              </Select>
            </div>

            <div>
              <span
                id="format-style-label"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Style
              </span>
              <div
                role="group"
                aria-labelledby="format-style-label"
                className="flex items-center gap-2">
                {(() => {
                  const currentFont =
                    positions[selectedField]?.fontFamily || "Helvetica";
                  const fontCapabilities =
                    FONT_CAPABILITIES[currentFont];
                  const boldDisabled = !fontCapabilities.bold;
                  const italicDisabled = !fontCapabilities.italic;

                  return (
                    <>
                      <Button
                        variant={
                          positions[selectedField]?.bold
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        disabled={boldDisabled}
                        onClick={() => {
                          if (!boldDisabled) {
                            setPositions((prev) => ({
                              ...prev,
                              [selectedField]: {
                                ...prev[selectedField],
                                bold: !prev[selectedField]?.bold
                              }
                            }));
                          }
                        }}
                        className="h-10 w-10"
                        style={{
                          backgroundColor: boldDisabled
                            ? COLORS.grayDisabled
                            : positions[selectedField]?.bold
                              ? COLORS.primaryMedium
                              : "transparent",
                          borderColor: boldDisabled
                            ? COLORS.borderDisabled
                            : COLORS.primaryMedium,
                          color: boldDisabled
                            ? COLORS.textDisabled
                            : positions[selectedField]?.bold
                              ? COLORS.white
                              : COLORS.primaryMedium,
                          cursor: boldDisabled
                            ? "not-allowed"
                            : "pointer"
                        }}
                        aria-pressed={!!positions[selectedField]?.bold}
                        aria-label="Bold"
                        title={
                          boldDisabled
                            ? `Bold not supported for ${currentFont}`
                            : "Bold (Ctrl/Cmd+B)"
                        }>
                        <strong>B</strong>
                      </Button>
                      <Button
                        variant={
                          positions[selectedField]?.italic
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        disabled={italicDisabled}
                        onClick={() => {
                          if (!italicDisabled) {
                            setPositions((prev) => ({
                              ...prev,
                              [selectedField]: {
                                ...prev[selectedField],
                                italic: !prev[selectedField]?.italic
                              }
                            }));
                          }
                        }}
                        className="h-10 w-10"
                        style={{
                          backgroundColor: italicDisabled
                            ? COLORS.grayDisabled
                            : positions[selectedField]?.italic
                              ? COLORS.primaryMedium
                              : "transparent",
                          borderColor: italicDisabled
                            ? COLORS.borderDisabled
                            : COLORS.primaryMedium,
                          color: italicDisabled
                            ? COLORS.textDisabled
                            : positions[selectedField]?.italic
                              ? COLORS.white
                              : COLORS.primaryMedium,
                          cursor: italicDisabled
                            ? "not-allowed"
                            : "pointer"
                        }}
                        aria-pressed={!!positions[selectedField]?.italic}
                        aria-label="Italic"
                        title={
                          italicDisabled
                            ? `Italic not supported for ${currentFont}`
                            : "Italic (Ctrl/Cmd+I)"
                        }>
                        <em>I</em>
                      </Button>
                      <Button
                        variant={
                          positions[selectedField]?.isVisible === false
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          setPositions((prev) => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              isVisible:
                                prev[selectedField]?.isVisible === false
                                  ? true
                                  : false
                            }
                          }));
                        }}
                        className="h-10 w-10"
                        style={{
                          backgroundColor:
                            positions[selectedField]?.isVisible ===
                            false
                              ? COLORS.primaryMedium
                              : "transparent",
                          borderColor: COLORS.primaryMedium,
                          color:
                            positions[selectedField]?.isVisible ===
                            false
                              ? COLORS.white
                              : COLORS.primaryMedium
                        }}
                        aria-pressed={positions[selectedField]?.isVisible === false}
                        aria-label="Hide field on certificate"
                        title={
                          positions[selectedField]?.isVisible !== false
                            ? "Hide field"
                            : "Show field"
                        }>
                        {positions[selectedField]?.isVisible !==
                        false ? (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="col-span-2 xl:col-span-1">
              <label
                htmlFor="format-size"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Size
              </label>
              <div className="flex items-center space-x-2">
                <input
                  id="format-size"
                  type="number"
                  inputMode="numeric"
                  min="8"
                  max="72"
                  value={fontSizeDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFontSizeDraft(raw);
                    const parsed = parseInt(raw, 10);
                    // Apply live while the value is in range; clamp on blur
                    if (!Number.isNaN(parsed) && parsed >= 8 && parsed <= 72) {
                      setPositions((prev) => ({
                        ...prev,
                        [selectedField]: {
                          ...prev[selectedField],
                          fontSize: parsed
                        }
                      }));
                    }
                  }}
                  onBlur={(e) => commitFontSize(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitFontSize(e.currentTarget.value);
                  }}
                  className="w-16 h-10 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-sm text-gray-500" aria-hidden="true">px</span>
              </div>
            </div>
          </div>


          {/* Resizing, Alignment and Colour Row */}
          <div className="grid grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
            {/* Resizing Mode */}
            <div>
              <label
                htmlFor="format-resizing"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Resizing
              </label>
              <Select
                id="format-resizing"
                value={positions[selectedField]?.textMode || "shrink"}
                onChange={(e) => {
                  setPositions((prev) => ({
                    ...prev,
                    [selectedField]: {
                      ...prev[selectedField],
                      textMode: e.target.value as "shrink" | "multiline"
                    }
                  }));
                }}
                className="text-xs h-10">
                <option value="shrink">Shrink to fit</option>
                <option value="multiline">Multi-line (2 lines)</option>
              </Select>
            </div>

            {/* Alignment */}
            <div className="w-32">
              <span
                id="format-alignment-label"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Alignment
              </span>
              <div
                role="group"
                aria-labelledby="format-alignment-label"
                className="flex gap-1">
                <Button
                  variant={
                    currentAlignment === "left"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    if (selectedField) {
                      changeAlignment(selectedField, "left");
                    }
                  }}
                  className="flex-1 h-10 px-0"
                  style={{
                    backgroundColor:
                      currentAlignment === "left"
                        ? COLORS.primaryMedium
                        : "transparent",
                    borderColor: COLORS.primaryMedium,
                    color:
                      currentAlignment === "left"
                        ? COLORS.white
                        : COLORS.primaryMedium
                  }}
                  aria-pressed={currentAlignment === "left"}
                  aria-label="Align left"
                  title="Align left">
                  <AlignLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={
                    currentAlignment === "center"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    if (selectedField) {
                      changeAlignment(selectedField, "center");
                    }
                  }}
                  className="flex-1 h-10 px-0"
                  style={{
                    backgroundColor:
                      currentAlignment === "center"
                        ? COLORS.primaryMedium
                        : "transparent",
                    borderColor: COLORS.primaryMedium,
                    color:
                      currentAlignment === "center"
                        ? COLORS.white
                        : COLORS.primaryMedium
                  }}
                  aria-pressed={currentAlignment === "center"}
                  aria-label="Align centre"
                  title="Align centre">
                  <AlignCenter className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant={
                    currentAlignment === "right"
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => {
                    if (selectedField) {
                      changeAlignment(selectedField, "right");
                    }
                  }}
                  className="flex-1 h-10 px-0"
                  style={{
                    backgroundColor:
                      currentAlignment === "right"
                        ? COLORS.primaryMedium
                        : "transparent",
                    borderColor: COLORS.primaryMedium,
                    color:
                      currentAlignment === "right"
                        ? COLORS.white
                        : COLORS.primaryMedium
                  }}
                  aria-pressed={currentAlignment === "right"}
                  aria-label="Align right"
                  title="Align right">
                  <AlignRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            {/* Colour Picker */}
            <div className="col-span-2 xl:col-span-1">
              <label
                htmlFor="format-colour"
                className="text-xs font-medium text-gray-600 mb-1 block">
                Colour
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="format-colour"
                  type="color"
                  value={positions[selectedField]?.color || COLORS.black}
                  onChange={(e) => {
                    setPositions((prev) => ({
                      ...prev,
                      [selectedField]: {
                        ...prev[selectedField],
                        color: e.target.value,
                        isColorAutomatic: false
                      }
                    }));
                  }}
                  className="w-10 h-10 rounded border border-gray-300 cursor-pointer flex-shrink-0"
                />
                <span className="text-xs text-gray-500 font-mono uppercase">
                  {positions[selectedField]?.color || COLORS.black}
                </span>
              </div>
            </div>
          </div>


          {/* Width Slider */}
          <div>
            <label
              htmlFor="format-width"
              className="text-xs font-medium text-gray-600 mb-1 block">
              Width: {positions[selectedField]?.width || 90}%
            </label>
            <input
              id="format-width"
              type="range"
              min="10"
              max="90"
              value={positions[selectedField]?.width || 90}
              onChange={(e) => {
                const newWidth = parseInt(e.target.value);
                setPositions((prev) => ({
                  ...prev,
                  [selectedField]: {
                    ...prev[selectedField],
                    width: newWidth
                  }
                }));
              }}
              aria-valuetext={`${positions[selectedField]?.width || 90}% of certificate width`}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              style={{
                background: `linear-gradient(to right, ${COLORS.primaryMedium} 0%, ${COLORS.primaryMedium} ${((positions[selectedField]?.width || 90) - 10) / 80 * 100}%, #e5e7eb ${((positions[selectedField]?.width || 90) - 10) / 80 * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Apply to All Button - More prominent placement */}
          <div>
            <ActionButton
              onClick={() => {
                const currentFormatting = positions[selectedField];
                if (currentFormatting && tableData.length > 0) {
                  const updatedPositions = { ...positions };
                  Object.keys(tableData[0]).forEach((key) => {
                    if (updatedPositions[key]) {
                      updatedPositions[key] = {
                        ...updatedPositions[key],
                        fontSize: currentFormatting.fontSize,
                        fontFamily: currentFormatting.fontFamily,
                        bold: currentFormatting.bold,
                        italic: currentFormatting.italic,
                        color: currentFormatting.color,
                        isColorAutomatic:
                          currentFormatting.isColorAutomatic ?? false,
                        alignment: currentFormatting.alignment,
                        textMode: currentFormatting.textMode,
                        width: currentFormatting.width
                      };
                    }
                  });
                  setPositions(updatedPositions);

                  setShowAppliedMessage(true);
                  setTimeout(() => setShowAppliedMessage(false), 2000);
                }
              }}
              title="Apply this field's formatting to all fields"
              gradient
              gradientType="primary"
              className="w-full px-4 py-2 text-sm font-medium">
              Apply formatting to all fields
            </ActionButton>
          </div>

          {/* Success message */}
          {showAppliedMessage && (
            <div
              role="status"
              className="px-3 py-2 rounded text-sm text-center border"
              style={{
                backgroundColor: COLORS.successLight,
                borderColor: COLORS.successMedium,
                color: COLORS.primary
              }}>
              <Check className="h-4 w-4 inline mr-1" aria-hidden="true" />
              Formatting applied to all fields
            </div>
          )}

          {/* Reset Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setShowResetFieldModal(true)}
              title="Reset this field to default formatting"
              className="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
              Reset field
            </button>

            <button
              type="button"
              onClick={() => setShowClearAllModal(true)}
              title="Reset all fields to default formatting"
              className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              Clear all
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
          <div className="mb-3 flex justify-center">
            <Edit3 className="h-8 w-8" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium mb-1">
            Select a text field to format
          </p>
          <p className="text-xs text-gray-400 mb-2">
            Click any text field in the certificate preview, or Tab to it and press Enter
          </p>
          {tableData.length > 0 && (
            <div className="mt-3 p-2 rounded border border-green-300 bg-green-50">
              <p className="text-xs text-gray-600 text-center">
                Selected fields have a green border
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
