import React, { useRef, useEffect, useState, useCallback } from "react";
import { EyeOff } from "lucide-react";
import Spinner from "@/components/Spinner";
import { DEFAULT_FONT_SIZE } from "@/utils/constants";
import { COLORS } from "@/utils/styles";
import {
  calculateShrinkToFitFontSize,
  splitTextIntoLines
} from "@/utils/textMeasurement";
import type { CertificatePreviewProps, FontFamily } from "@/types/certificate";

// Upload icon component (moved from main page)
function UploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function CertificatePreviewComponent({
  uploadedFileUrl,
  isLoading,
  tableData,
  currentPreviewIndex,
  positions,
  selectedField,
  setSelectedField,
  isDragging,
  dragInfo,
  showCenterGuide,
  handlePointerDown,
  handlePointerUp,
  setShowCenterGuide,
  isDraggingFile,
  handleDragOver,
  handleDragLeave,
  handleFileDrop,
  handleFileUpload
}: CertificatePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Function to update container width
  const updateWidth = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  // Update container width on resize
  useEffect(() => {
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [uploadedFileUrl, updateWidth]);

  // Font family mapping for CSS
  const fontFamilyMap: Record<FontFamily, string> = {
    Helvetica: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    Times: 'Times, "Times New Roman", Georgia, serif',
    Courier: 'Courier, "Courier New", monospace',
    Montserrat: 'var(--font-montserrat), "Montserrat", sans-serif',
    Poppins: 'var(--font-poppins), "Poppins", sans-serif',
    SourceSansPro: 'var(--font-source-sans-pro), "Source Sans Pro", sans-serif',
    Nunito: 'var(--font-nunito), "Nunito", sans-serif',
    GreatVibes: 'var(--font-great-vibes), "Great Vibes", cursive',
    Archivo: 'var(--font-archivo), "Archivo", sans-serif',
    Rubik: 'var(--font-rubik), "Rubik", sans-serif'
  };

  return (
    <div className="relative w-full image-container">
      {isLoading && <Spinner />}
      {uploadedFileUrl ? (
        <>
          <div className="border-4 border-gray-700 inline-block relative w-full" ref={containerRef}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uploadedFileUrl}
              alt="Certificate Template"
              className="w-full h-auto block"
              onLoad={updateWidth}
              onError={() => {
                console.error("Failed to load image:", uploadedFileUrl);
                updateWidth();
              }}
            />
            <div
              className="absolute inset-0"
              onClick={(e) => {
                // Only deselect if clicking on the overlay itself, not on text fields
                if (e.target === e.currentTarget) {
                  setSelectedField(null);
                  setShowCenterGuide({
                    horizontal: false,
                    vertical: false
                  });
                }
              }}>
              {tableData.length > 0 &&
                Object.entries(
                  tableData[currentPreviewIndex] || tableData[0]
                ).map(([key, value], index) => {
                  const isHidden = positions[key]?.isVisible === false;
                  const isCurrentlyDragging =
                    isDragging && dragInfo?.key === key;
                  const isSelected = selectedField === key;
                  const fontSize =
                    positions[key]?.fontSize || DEFAULT_FONT_SIZE;
                  const fontFamily =
                    (positions[key]?.fontFamily as FontFamily) || "Helvetica";
                  const isBold = positions[key]?.bold || false;
                  const isItalic = positions[key]?.italic || false;
                  const textColor = positions[key]?.color || "#000000";
                  const alignment = positions[key]?.alignment || "center";
                  const textMode = positions[key]?.textMode || "shrink";
                  const widthPercent = positions[key]?.width || 90;
                  const lineHeight = positions[key]?.lineHeight || 1.2;

                  // Calculate actual width in pixels
                  const maxWidth = containerWidth * (widthPercent / 100);

                  // Calculate font size and lines based on text mode
                  let actualFontSize = fontSize;
                  let textLines: string[] = [value];

                  if (containerWidth > 0) {
                    if (textMode === "shrink") {
                      // Calculate font size to fit width
                      actualFontSize = calculateShrinkToFitFontSize(
                        value,
                        maxWidth,
                        fontSize,
                        8, // min font size
                        fontFamily,
                        isBold,
                        isItalic
                      );
                    } else if (textMode === "multiline") {
                      // Split text into lines
                      textLines = splitTextIntoLines(
                        value,
                        maxWidth,
                        fontSize,
                        2, // max 2 lines
                        fontFamily,
                        isBold,
                        isItalic
                      );
                    }
                  }

                  // Calculate position based on alignment and width
                  const xPos = positions[key]?.x ?? 50;
                  let leftPos: string;
                  let transformX: string;
                  
                  if (alignment === "center") {
                    // Center: position at x - half width
                    leftPos = `${xPos - widthPercent / 2}%`;
                    transformX = "0%";
                  } else if (alignment === "right") {
                    // Right: position at x - full width
                    leftPos = `${xPos - widthPercent}%`;
                    transformX = "0%";
                  } else {
                    // Left: position at x
                    leftPos = `${xPos}%`;
                    transformX = "0%";
                  }

                  const style = {
                    left: leftPos,
                    top: `${positions[key]?.y ?? 50 + index * 10}%`,
                    transform: `translate(${transformX}, -50%)`,
                    fontSize: `${actualFontSize}px`,
                    fontFamily: fontFamilyMap[fontFamily],
                    fontWeight: isBold ? "bold" : "normal",
                    fontStyle: isItalic ? "italic" : "normal",
                    color: textColor,
                    width: `${widthPercent}%`,
                    lineHeight: lineHeight,
                    textAlign: alignment,
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "initial",
                    wordWrap: "normal" as const,
                    position: "absolute" as const,
                    pointerEvents: "auto" as const,
                    userSelect: "none" as const,
                    touchAction: "none",
                    opacity: isHidden ? 0.3 : 1,
                    backgroundColor: isCurrentlyDragging
                      ? "rgba(231, 111, 81, 0.15)"
                      : isSelected
                        ? "rgba(45, 106, 79, 0.15)"
                        : isHidden
                          ? "rgba(128, 128, 128, 0.1)"
                          : "transparent",
                    border: isCurrentlyDragging
                      ? `2px solid ${COLORS.coral}`
                      : isSelected
                        ? `2px solid ${COLORS.primaryMedium}`
                        : isHidden
                          ? "2px dashed #999"
                          : "2px solid transparent",
                    borderRadius: "4px",
                    padding: "2px 4px",
                    cursor: isCurrentlyDragging ? "grabbing" : "grab"
                  };

                  return (
                    <div
                      key={key}
                      data-key={key}
                      className="absolute"
                      style={style}
                      onPointerDown={(e) => handlePointerDown(e, key)}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}>
                      {/* Alignment indicator - bracket style */}
                      {isSelected && (
                        <>
                          {/* Left alignment indicator */}
                          {alignment === "left" && (
                            <>
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "-2px",
                                  top: "-2px",
                                  width: "4px",
                                  height: "8px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "-2px",
                                  top: "-2px",
                                  width: "8px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "-2px",
                                  bottom: "-2px",
                                  width: "4px",
                                  height: "8px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "-2px",
                                  bottom: "-2px",
                                  width: "8px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                            </>
                          )}

                          {/* Center alignment indicator */}
                          {alignment === "center" && (
                            <>
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "calc(50% - 6px)",
                                  top: "-2px",
                                  width: "12px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  left: "calc(50% - 6px)",
                                  bottom: "-2px",
                                  width: "12px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                            </>
                          )}

                          {/* Right alignment indicator */}
                          {alignment === "right" && (
                            <>
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  right: "-2px",
                                  top: "-2px",
                                  width: "4px",
                                  height: "8px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  right: "-2px",
                                  top: "-2px",
                                  width: "8px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  right: "-2px",
                                  bottom: "-2px",
                                  width: "4px",
                                  height: "8px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                              <div
                                className="absolute pointer-events-none"
                                style={{
                                  right: "-2px",
                                  bottom: "-2px",
                                  width: "8px",
                                  height: "4px",
                                  backgroundColor: COLORS.coral
                                }}
                              />
                            </>
                          )}
                        </>
                      )}
                      {/* Render text - single line or multiple lines */}
                      {textMode === "multiline" && textLines.length > 1 ? (
                        <div>
                          {textLines.slice(0, 2).map((line, lineIndex) => (
                            <div key={lineIndex} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                          ))}
                        </div>
                      ) : (
                        textLines[0]
                      )}
                      {/* Not visible indicator */}
                      {isHidden && (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            top: "2px",
                            right: "2px",
                            opacity: 0.6
                          }}>
                          <EyeOff
                            className="h-3 w-3"
                            style={{ color: "#666" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

              {/* Center alignment guides */}
              <>
                {/* Vertical center line - shown when snapping horizontally (X-axis) */}
                <div
                  className="absolute pointer-events-none border-l-2 border-dashed transition-all duration-200 ease-in-out"
                  style={{
                    left: "50%",
                    top: "0%",
                    height: "100%",
                    marginLeft: "-1px",
                    borderColor: COLORS.coral,
                    opacity: showCenterGuide.vertical ? 0.8 : 0,
                    transform: showCenterGuide.vertical
                      ? "scaleY(1)"
                      : "scaleY(0.8)",
                    transformOrigin: "center"
                  }}
                />
                {/* Horizontal center line - shown when snapping vertically (Y-axis) */}
                <div
                  className="absolute pointer-events-none border-t-2 border-dashed transition-all duration-200 ease-in-out"
                  style={{
                    top: "50%",
                    left: "0%",
                    width: "100%",
                    marginTop: "-1px",
                    borderColor: COLORS.coral,
                    opacity: showCenterGuide.horizontal ? 0.8 : 0,
                    transform: showCenterGuide.horizontal
                      ? "scaleX(1)"
                      : "scaleX(0.8)",
                    transformOrigin: "center"
                  }}
                />
              </>
            </div>
          </div>
        </>
      ) : (
        <div
          className={`flex items-center justify-center h-64 rounded-lg border-2 border-dashed transition-colors ${
            isDraggingFile ? "text-white" : "text-gray-600 bg-gray-50"
          }`}
          style={{
            borderColor: isDraggingFile ? COLORS.primaryMedium : COLORS.borderGray,
            backgroundColor: isDraggingFile
              ? "rgba(45, 106, 79, 0.1)"
              : COLORS.grayLight
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleFileDrop}
          data-tour="upload-area">
          <label
            htmlFor="file-upload"
            className="cursor-pointer w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center justify-center space-y-2">
              <UploadIcon
                className={`h-12 w-12 ${
                  isDraggingFile ? "animate-pulse" : ""
                }`}
              />
              <span className="text-center">
                {isDraggingFile
                  ? "Drop your image here"
                  : "Upload your certificate's background image here, in JPEG or PNG format"}
              </span>
            </div>
            <input
              id="file-upload"
              type="file"
              onChange={handleFileUpload}
              accept="image/jpeg,image/png"
              className="sr-only"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const CertificatePreview = React.memo(CertificatePreviewComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.uploadedFileUrl === nextProps.uploadedFileUrl &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.currentPreviewIndex === nextProps.currentPreviewIndex &&
    prevProps.selectedField === nextProps.selectedField &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isDraggingFile === nextProps.isDraggingFile &&
    prevProps.showCenterGuide === nextProps.showCenterGuide &&
    // Deep comparison for positions (only for the current preview)
    JSON.stringify(prevProps.positions) === JSON.stringify(nextProps.positions) &&
    // Deep comparison for current table data only
    JSON.stringify(prevProps.tableData[prevProps.currentPreviewIndex]) === 
    JSON.stringify(nextProps.tableData[nextProps.currentPreviewIndex])
  );
});