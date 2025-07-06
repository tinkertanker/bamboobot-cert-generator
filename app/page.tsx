"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Modal, ModalHeader, ModalTitle, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import Spinner from "@/components/Spinner";
import {
  useTable,
  Column,
  ColumnInstance,
  HeaderGroup,
  Row,
  Cell
} from "react-table";
import { saveAs } from "file-saver";
import { useTableData, type TableData } from "@/hooks/useTableData";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePreview } from "@/hooks/usePreview";
import { useFileUpload } from "@/hooks/useFileUpload";
import { usePositioning } from "@/hooks/usePositioning";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useEmailConfig } from "@/hooks/useEmailConfig";
import { usePdfGeneration } from "@/hooks/usePdfGeneration";
import {
  ExternalLink,
  Download,
  FileText,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward
} from "lucide-react";
import { CertificatePreview } from "@/components/CertificatePreview";
import { DataPanel } from "@/components/panels/DataPanel";
import { FormattingPanel } from "@/components/panels/FormattingPanel";



export default function MainPage() {
  // Preset data for dev mode
  const presetCSVData = `Name,Department,Phone
Maximilienne Featherstone-Harrington III,Executive Leadership,+1-555-MAXI-EXEC
Bartholomäus von Quackenbusch-Wetherell,Innovation & Strategy,+1-555-BART-INNO
Anastasiopolis Meridienne Calderón-Rutherford,Global Operations,+1-555-ANAS-GLOB`;

  // Table data management via custom hook
  const {
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    detectedEmailColumn,
    handleTableDataChange,
    handleHeaderToggle,
    handleCSVModeToggle,
    loadPresetData,
    clearData
  } = useTableData();

  const [devMode, setDevMode] = useState<boolean>(false);
  // Positioning hook
  const {
    positions,
    setPositions,
    changeAlignment,
    clearPositions
  } = usePositioning({ tableData });
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "formatting" | "email">(
    "data"
  );
  const [showAppliedMessage, setShowAppliedMessage] = useState<boolean>(false);
  const [selectedNamingColumn, setSelectedNamingColumn] = useState<string>("");
  const [showResetFieldModal, setShowResetFieldModal] =
    useState<boolean>(false);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);


  // Drag and drop hook
  const {
    isDragging,
    dragInfo,
    showCenterGuide,
    setShowCenterGuide,
    handlePointerDown,
    handlePointerUp,
    clearDragState
  } = useDragAndDrop({
    positions,
    setPositions,
    setSelectedField,
    setActiveTab
  });

  // Switch away from email tab if no email column detected
  useEffect(() => {
    if (!detectedEmailColumn && activeTab === "email") {
      setActiveTab("data");
    }
  }, [detectedEmailColumn, activeTab]);



  // Preview navigation hook
  const {
    currentPreviewIndex,
    goToFirst,
    goToPrevious,
    goToNext,
    goToLast,
    setCurrentPreviewIndex
  } = usePreview(tableData.length);

  // File upload hook
  const {
    uploadedFile,
    uploadedFileUrl,
    isLoading,
    isDraggingFile,
    setUploadedFile,
    setUploadedFileUrl,
    handleFileUpload,
    handleDragOver,
    handleDragLeave,
    handleFileDrop,
    clearFile
  } = useFileUpload();

  // PDF generation hook (must come after file upload hook)
  const {
    isGenerating,
    isGeneratingIndividual,
    generatedPdfUrl,
    individualPdfsData,
    generatePdf,
    generateIndividualPdfs,
    handleDownloadPdf,
    setGeneratedPdfUrl,
    setIndividualPdfsData,
    clearPdfData
  } = usePdfGeneration({
    tableData,
    positions,
    uploadedFile,
    selectedNamingColumn,
    setSelectedNamingColumn
  });

  // Email configuration hook (must come after PDF generation hook)
  const {
    emailConfig,
    setEmailConfig,
    emailSendingStatus,
    sendCertificateEmail,
    hasEmailColumn
  } = useEmailConfig({
    detectedEmailColumn,
    tableData,
    individualPdfsData
  });

  // Handle escape key press to close all modals
  const handleEscapePressed = useCallback(() => {
    setGeneratedPdfUrl(null);
    setIndividualPdfsData(null);
    setShowResetFieldModal(false);
    setShowClearAllModal(false);
  }, [setGeneratedPdfUrl, setIndividualPdfsData]);

  // Keyboard shortcuts hook
  useKeyboardShortcuts({
    selectedField,
    isDragging,
    positions,
    setPositions,
    onEscapePressed: handleEscapePressed
  });





  const handleDevModeToggle = () => {
    setDevMode((prev) => {
      const newValue = !prev;
      if (newValue) {
        // Enable dev mode: load preset data and template
        loadPresetData(presetCSVData);

        // Set the uploaded file URL to the preset image
        const presetImageUrl = "/temp_images/certificate-template.png";
        setUploadedFileUrl(presetImageUrl);

        // Create a mock file object for the preset template (use PDF filename)
        const mockFile = new File([""], "certificate-template.pdf", {
          type: "application/pdf"
        });
        setUploadedFile(mockFile);

        console.log("Dev mode enabled: preset template and data loaded");
      } else {
        // Disable dev mode: clear data
        clearData();
        clearFile();
        clearPositions();
        clearPdfData();
        console.log("Dev mode disabled: data cleared");
      }
      return newValue;
    });
  };



  const columns: Column<TableData>[] = useMemo(
    () =>
      tableData.length > 0
        ? Object.keys(tableData[0]).map((key, index) => ({
            Header: key || `Column ${index + 1}`, // Display name for blank headers
            accessor: key || `_column_${index}` // Ensure valid accessor for React Table
          }))
        : [],
    [tableData]
  );

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({ columns, data: tableData });


  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: "#F5F1E8" }}>
      <header
        className="py-4 px-6"
        style={{
          background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
          boxShadow: "0 2px 4px rgba(27, 67, 50, 0.1)"
        }}>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/bamboobot-icon.png"
                alt="Bamboobot"
                width={32}
                height={32}
                className="w-8 h-8"
              />
              <h1 className="text-2xl font-bold" style={{ color: "#F4A261" }}>
                Bamboobot
              </h1>
            </div>
            {/* Dev Mode Toggle */}
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg border">
              <input
                type="checkbox"
                id="dev-mode-toggle"
                checked={devMode}
                onChange={handleDevModeToggle}
                className="w-4 h-4"
              />
              <label
                htmlFor="dev-mode-toggle"
                className="text-sm font-medium text-gray-700">
                Dev Mode
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <ActionButton
              onClick={generatePdf}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                tableData.length === 0
              }
              gradient
              gradientType="coral"
              className="font-semibold px-6">
              {isGenerating ? "Generating..." : "Generate PDF"}
            </ActionButton>
            <ActionButton
              onClick={generateIndividualPdfs}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                tableData.length === 0
              }
              gradient
              gradientType="coral"
              className="font-semibold px-6">
              {isGeneratingIndividual
                ? "Generating..."
                : "Generate Individual PDFs"}
            </ActionButton>
          </div>
        </div>
      </header>
      <main className="flex-1 grid grid-cols-[60%_40%] gap-6 p-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <CertificatePreview
            uploadedFileUrl={uploadedFileUrl}
            isLoading={isLoading}
            tableData={tableData}
            currentPreviewIndex={currentPreviewIndex}
            positions={positions}
            selectedField={selectedField}
            setSelectedField={setSelectedField}
            isDragging={isDragging}
            dragInfo={dragInfo}
            showCenterGuide={showCenterGuide}
            handlePointerDown={handlePointerDown}
            handlePointerUp={handlePointerUp}
            setShowCenterGuide={setShowCenterGuide}
            isDraggingFile={isDraggingFile}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleFileDrop={handleFileDrop}
            handleFileUpload={handleFileUpload}
          />

          {/* Toolbar */}
          {uploadedFileUrl && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <ActionButton
                    onClick={() => {
                      clearFile();
                      clearPositions();
                      clearDragState();
                    }}
                    variant="outline"
                    size="sm"
                    gradient
                    gradientType="primary">
                    Clear Template
                  </ActionButton>
                </div>

                {/* Arrow key hint - center aligned */}
                {selectedField && (
                  <div className="flex items-center justify-center text-xs text-gray-500">
                    <span>
                      Use arrow keys to nudge selected text (Shift for larger
                      steps)
                    </span>
                  </div>
                )}

                {/* Navigation buttons - right aligned */}
                {tableData.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium">
                      {currentPreviewIndex + 1} of {tableData.length}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === 0}
                        className={
                          currentPreviewIndex === 0
                            ? "text-gray-400 border-gray-300 px-2"
                            : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"
                        }
                        title="First entry"
                        onClick={goToFirst}>
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === 0}
                        className={
                          currentPreviewIndex === 0
                            ? "text-gray-400 border-gray-300 px-2"
                            : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"
                        }
                        title="Previous entry"
                        onClick={goToPrevious}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === tableData.length - 1}
                        className={
                          currentPreviewIndex === tableData.length - 1
                            ? "text-gray-400 border-gray-300 px-2"
                            : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"
                        }
                        title="Next entry"
                        onClick={goToNext}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === tableData.length - 1}
                        className={
                          currentPreviewIndex === tableData.length - 1
                            ? "text-gray-400 border-gray-300 px-2"
                            : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"
                        }
                        title="Last entry"
                        onClick={goToLast}>
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="bg-card p-4 rounded-lg shadow mr-6">
          {/* Tab Navigation */}
          <div className="flex mb-4 bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab("data")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              style={{
                backgroundColor: activeTab === "data" ? "#2D6A4F" : "#cccccc",
                color: activeTab === "data" ? "#ffffff" : "#374151"
              }}>
              Data
            </button>
            <button
              onClick={() => setActiveTab("formatting")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              style={{
                backgroundColor:
                  activeTab === "formatting" ? "#2D6A4F" : "#cccccc",
                color: activeTab === "formatting" ? "#ffffff" : "#374151"
              }}>
              Formatting
            </button>
            {detectedEmailColumn && (
              <button
                onClick={() => setActiveTab("email")}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center"
                style={{
                  backgroundColor:
                    activeTab === "email" ? "#2D6A4F" : "#cccccc",
                  color: activeTab === "email" ? "#ffffff" : "#374151"
                }}>
                Email
                {detectedEmailColumn &&
                  !["email", "e-mail", "mail"].includes(
                    detectedEmailColumn.toLowerCase()
                  ) && (
                    <span
                      className={`ml-1 px-1.5 py-0.5 text-xs ${
                        activeTab === "email"
                          ? "text-amber-600"
                          : "text-green-800"
                      }`}
                      style={{
                        backgroundColor:
                          activeTab === "email" ? "#F4A261" : "#D1FAE5",
                        borderRadius: "4px"
                      }}>
                      {detectedEmailColumn}
                    </span>
                  )}
              </button>
            )}
          </div>

          {/* Tab Content */}
          {activeTab === "data" && (
            <DataPanel
              tableInput={tableInput}
              handleTableDataChange={handleTableDataChange}
              isFirstRowHeader={isFirstRowHeader}
              handleHeaderToggle={handleHeaderToggle}
              useCSVMode={useCSVMode}
              handleCSVModeToggle={handleCSVModeToggle}
              tableData={tableData}
              getTableProps={getTableProps}
              getTableBodyProps={getTableBodyProps}
              headerGroups={headerGroups}
              rows={rows}
              prepareRow={prepareRow}
              detectedEmailColumn={detectedEmailColumn}
              currentPreviewIndex={currentPreviewIndex}
              setCurrentPreviewIndex={setCurrentPreviewIndex}
            />
          )}

          {activeTab === "formatting" && (
            <FormattingPanel
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              positions={positions}
              setPositions={setPositions}
              tableData={tableData}
              changeAlignment={changeAlignment}
              showAppliedMessage={showAppliedMessage}
              setShowAppliedMessage={setShowAppliedMessage}
              setShowResetFieldModal={setShowResetFieldModal}
              setShowClearAllModal={setShowClearAllModal}
              setShowCenterGuide={setShowCenterGuide}
            />
          )}

          {activeTab === "email" && (
            <div className="flex flex-col h-full space-y-6">
              <div
                className="flex items-center justify-between p-3 rounded-lg relative"
                style={{
                  backgroundColor: "#FFFEF7",
                  border: "1px solid #dddddd"
                }}>
                <h3 className="text-sm">
                  <span className="text-gray-500 font-normal">Field:</span>{" "}
                  <span className="font-medium text-gray-900">
                    {detectedEmailColumn}
                  </span>
                </h3>
                {selectedField && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedField(null);
                      setShowCenterGuide({
                        horizontal: false,
                        vertical: false
                      });
                    }}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {/* Email Settings */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      From:
                    </label>
                    <input
                      type="text"
                      value={emailConfig.senderName}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setEmailConfig((prev) => {
                          const updated = { ...prev, senderName: newValue };
                          updated.isConfigured = !!(
                            updated.senderName &&
                            updated.subject &&
                            updated.message
                          );
                          return updated;
                        });
                      }}
                      placeholder="Jane Smith"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Subject:
                    </label>
                    <input
                      type="text"
                      value={emailConfig.subject}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setEmailConfig((prev) => {
                          const updated = { ...prev, subject: newValue };
                          updated.isConfigured = !!(
                            updated.senderName &&
                            updated.subject &&
                            updated.message
                          );
                          return updated;
                        });
                      }}
                      placeholder="Your Certificate of Completion"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Message (plain text):
                  </label>
                  <textarea
                    value={emailConfig.message}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setEmailConfig((prev) => {
                        const updated = { ...prev, message: newValue };
                        updated.isConfigured = !!(
                          updated.senderName &&
                          updated.subject &&
                          updated.message
                        );
                        return updated;
                      });
                    }}
                    placeholder={`Hi there,\n\nYour certificate is ready! Please find it attached.\n\nThanks!`}
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Delivery Method */}
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p className="font-medium mb-1">Send certificate as:</p>
                  <label className="inline-flex items-center ml-4 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="download"
                      checked={emailConfig.deliveryMethod === "download"}
                      onChange={(e) =>
                        setEmailConfig((prev) => ({
                          ...prev,
                          deliveryMethod: e.target.value as
                            | "download"
                            | "attachment"
                        }))
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Download link (expires 90 days)
                    </span>
                  </label>
                  <label className="inline-flex items-center ml-6 cursor-pointer">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="attachment"
                      checked={emailConfig.deliveryMethod === "attachment"}
                      onChange={(e) =>
                        setEmailConfig((prev) => ({
                          ...prev,
                          deliveryMethod: e.target.value as
                            | "download"
                            | "attachment"
                        }))
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      PDF attachment
                    </span>
                  </label>
                </div>
              </div>

              {/* Configuration Status */}
              <div className="mt-6 p-4 rounded-lg border">
                {emailConfig.senderName &&
                emailConfig.subject &&
                emailConfig.message ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">
                      Email configuration complete.{" "}
                      <span className="font-medium">
                        Generate Individual PDFs
                      </span>{" "}
                      to send.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700">
                    <div className="h-2 w-2 bg-amber-500 rounded-full"></div>
                    <span className="text-sm font-medium">
                      Complete all fields above to enable email sending
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      {(isGenerating || generatedPdfUrl) && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
          onClick={() => !isGenerating && setGeneratedPdfUrl(null)}>
          <div
            className="relative bg-white bg-opacity-100 w-3/4 max-w-6xl mx-auto rounded-lg shadow-xl p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}>
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Spinner />
                <p className="mt-4 text-lg">Generating PDF...</p>
              </div>
            ) : generatedPdfUrl ? (
              <>
                <h2 className="text-2xl font-bold mb-4">PDF Generated</h2>
                <div className="bg-gray-100 p-2 rounded-lg mb-4">
                  <iframe
                    src={generatedPdfUrl}
                    width="100%"
                    height="600"
                    title="Generated PDF"
                    className="border-0 rounded"
                  />
                </div>
                <div className="flex justify-end space-x-4">
                  <ActionButton
                    onClick={handleDownloadPdf}
                    gradient
                    gradientType="coral">
                    Download PDF
                  </ActionButton>
                  <Button
                    onClick={() => setGeneratedPdfUrl(null)}
                    variant="outline"
                    style={{
                      borderColor: "#6B7280",
                      color: "#6B7280"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#F3F4F6";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}>
                    Close
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Individual PDFs Modal */}
      <Modal
        open={isGeneratingIndividual || !!individualPdfsData}
        onClose={() => {
          if (!isGeneratingIndividual) {
            setIndividualPdfsData(null);
            setSelectedNamingColumn("");
          }
        }}
        closeOnBackdropClick={!isGeneratingIndividual}
        width="w-3/4 max-w-6xl"
        className="h-auto max-h-[90vh] overflow-y-auto">
            {isGeneratingIndividual ? (
              <div className="flex flex-col items-center justify-center h-64">
                <Spinner />
                <p className="mt-4 text-lg">Generating Individual PDFs...</p>
              </div>
            ) : individualPdfsData ? (
              <>
                <h2 className="text-2xl font-bold mb-4">
                  Generated {individualPdfsData.length} Individual Certificates
                </h2>

                {/* File Naming Controls */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-12 items-center gap-4">
                    <label className="font-medium col-span-4">
                      Use this field for download filename:
                    </label>
                    <div className="col-span-8">
                      <Select
                        value={selectedNamingColumn}
                        onChange={(e) =>
                          setSelectedNamingColumn(e.target.value)
                        }
                        className="text-sm w-full">
                        {tableData.length > 0 &&
                          Object.keys(tableData[0]).map((column) => (
                            <option key={column} value={column}>
                              {column}
                            </option>
                          ))}
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Files List */}
                <div className="bg-gray-100 p-4 rounded-lg mb-4 max-h-96 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    <h3 className="font-medium">Files Ready:</h3>
                  </div>
                  <div className="space-y-2">
                    {individualPdfsData.map((file, index) => {
                      // Generate filename based on selected column
                      const baseFilename =
                        tableData[index] && selectedNamingColumn
                          ? tableData[index][selectedNamingColumn] ||
                            `Certificate-${index + 1}`
                          : `Certificate-${index + 1}`;

                      // Sanitize filename
                      const sanitizedFilename = baseFilename.replace(
                        /[^a-zA-Z0-9-_]/g,
                        "_"
                      );

                      // Handle duplicates
                      const duplicateCount = individualPdfsData
                        .slice(0, index)
                        .filter((_, i) => {
                          const prevBase =
                            tableData[i] && selectedNamingColumn
                              ? tableData[i][selectedNamingColumn] ||
                                `Certificate-${i + 1}`
                              : `Certificate-${i + 1}`;
                          return prevBase === baseFilename;
                        }).length;

                      const filename =
                        duplicateCount > 0
                          ? `${sanitizedFilename}-${duplicateCount}.pdf`
                          : `${sanitizedFilename}.pdf`;

                      return (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                          <span className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-600" />
                            <span className="font-mono text-sm">
                              {filename}
                            </span>
                          </span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              title="Open PDF"
                              onClick={() => {
                                window.open(file.url, "_blank");
                              }}
                              className="h-8 w-8 p-0">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Download PDF"
                              onClick={() => {
                                // Use force-download API to ensure proper download
                                const downloadUrl = `/api/force-download?url=${encodeURIComponent(file.url)}&filename=${encodeURIComponent(filename)}`;
                                window.location.href = downloadUrl;
                              }}
                              className="h-8 w-8 p-0">
                              <Download className="h-4 w-4" />
                            </Button>
                            {hasEmailColumn && (
                              <Button
                                size="sm"
                                variant={
                                  emailSendingStatus[index] === "sent"
                                    ? "default"
                                    : "outline"
                                }
                                title={
                                  !emailConfig.isConfigured
                                    ? "Configure email settings in Email tab first"
                                    : emailSendingStatus[index] === "sending"
                                      ? "Sending email..."
                                      : emailSendingStatus[index] === "sent"
                                        ? "Email sent!"
                                        : emailSendingStatus[index] === "error"
                                          ? "Failed to send email"
                                          : "Send via email"
                                }
                                disabled={
                                  emailSendingStatus[index] === "sending" ||
                                  !emailConfig.isConfigured
                                }
                                onClick={() =>
                                  sendCertificateEmail(index, file)
                                }
                                className="h-8 w-8 p-0"
                                style={{
                                  backgroundColor:
                                    emailSendingStatus[index] === "sent"
                                      ? "#2D6A4F"
                                      : emailSendingStatus[index] === "error"
                                        ? "#dc2626"
                                        : "transparent",
                                  borderColor:
                                    emailSendingStatus[index] === "sent"
                                      ? "#2D6A4F"
                                      : emailSendingStatus[index] === "error"
                                        ? "#dc2626"
                                        : "#2D6A4F",
                                  color:
                                    emailSendingStatus[index] === "sent"
                                      ? "white"
                                      : emailSendingStatus[index] === "error"
                                        ? "white"
                                        : "#2D6A4F"
                                }}>
                                {emailSendingStatus[index] === "sending" ? (
                                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between">
                  <div className="flex gap-2">
                    <ActionButton
                      onClick={async () => {
                        try {
                          // Create a list of files with their custom names
                          const fileList = individualPdfsData.map(
                            (file, index) => {
                              const baseFilename =
                                tableData[index] && selectedNamingColumn
                                  ? tableData[index][selectedNamingColumn] ||
                                    `Certificate-${index + 1}`
                                  : `Certificate-${index + 1}`;
                              const sanitizedFilename = baseFilename.replace(
                                /[^a-zA-Z0-9-_]/g,
                                "_"
                              );

                              // Handle duplicates
                              const duplicateCount = individualPdfsData
                                .slice(0, index)
                                .filter((_, i) => {
                                  const prevBase =
                                    tableData[i] && selectedNamingColumn
                                      ? tableData[i][selectedNamingColumn] ||
                                        `Certificate-${i + 1}`
                                      : `Certificate-${i + 1}`;
                                  return prevBase === baseFilename;
                                }).length;

                              const filename =
                                duplicateCount > 0
                                  ? `${sanitizedFilename}-${duplicateCount}.pdf`
                                  : `${sanitizedFilename}.pdf`;

                              return {
                                url: file.url,
                                filename: filename
                              };
                            }
                          );

                          // Call the ZIP API endpoint
                          const response = await fetch("/api/zip-pdfs", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json"
                            },
                            body: JSON.stringify({ files: fileList })
                          });

                          if (!response.ok) {
                            const errorText = await response.text();
                            console.error("ZIP API Error:", errorText);
                            throw new Error(
                              `Failed to create ZIP: ${response.status} ${response.statusText}`
                            );
                          }

                          const blob = await response.blob();
                          saveAs(
                            blob,
                            `certificates_${
                              new Date().toISOString().split("T")[0]
                            }.zip`
                          );
                        } catch (error) {
                          console.error("Error creating ZIP:", error);
                          alert("Failed to create ZIP file. Please try again.");
                        }
                      }}
                      gradient
                      gradientType="coral"
                      className="flex items-center gap-2">
                      <Download className="h-4 w-4" />
                      Download All (ZIP)
                    </ActionButton>
                    {hasEmailColumn && (
                      <Button
                        onClick={() => {
                          alert(
                            "Email functionality will be implemented soon!"
                          );
                        }}
                        variant="outline"
                        disabled
                        className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email All
                      </Button>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      setIndividualPdfsData(null);
                      setSelectedNamingColumn("");
                    }}
                    variant="outline"
                    style={{
                      borderColor: "#6B7280",
                      color: "#6B7280"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#F3F4F6";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    className="flex items-center gap-2">
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                </div>
              </>
            ) : null}
      </Modal>

      {/* Reset Field Confirmation Modal */}
      <Modal
        open={showResetFieldModal && !!selectedField}
        onClose={() => setShowResetFieldModal(false)}>
        <ModalHeader>
          <ModalTitle>Reset Field Formatting</ModalTitle>
        </ModalHeader>
        <ModalContent>
          Are you sure you want to reset the formatting for &quot;
          {selectedField}&quot; to default settings?
        </ModalContent>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowResetFieldModal(false)}
            className="px-4 py-2">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedField && positions[selectedField]) {
                setPositions((prev) => ({
                  ...prev,
                  [selectedField]: {
                    ...prev[selectedField],
                    fontSize: DEFAULT_FONT_SIZE,
                    fontFamily: "Helvetica",
                    bold: false,
                    italic: false,
                    color: "#000000",
                    alignment: "left"
                  }
                }));
              }
              setShowResetFieldModal(false);
            }}
            className="px-4 py-2"
            style={{
              backgroundColor: "#6B7280",
              color: "white"
            }}>
            Reset
          </Button>
        </ModalFooter>
      </Modal>

      {/* Clear All Formatting Confirmation Modal */}
      <Modal
        open={showClearAllModal}
        onClose={() => setShowClearAllModal(false)}>
        <ModalHeader>
          <ModalTitle>Clear All Formatting</ModalTitle>
        </ModalHeader>
        <ModalContent>
          Are you sure you want to reset all text fields to default
          formatting? This action cannot be undone.
        </ModalContent>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowClearAllModal(false)}
            className="px-4 py-2">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (tableData.length > 0) {
                const updatedPositions = { ...positions };
                Object.keys(tableData[0]).forEach((key) => {
                  if (updatedPositions[key]) {
                    updatedPositions[key] = {
                      ...updatedPositions[key],
                      fontSize: DEFAULT_FONT_SIZE,
                      fontFamily: "Helvetica",
                      bold: false,
                      italic: false,
                      color: "#000000",
                      alignment: "left"
                    };
                  }
                });
                setPositions(updatedPositions);
              }
              setShowClearAllModal(false);
            }}
            className="px-4 py-2"
            style={{
              backgroundColor: "#DC2626",
              color: "white"
            }}>
            Clear All
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

