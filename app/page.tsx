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
import { useTableData, type TableData } from "@/hooks/useTableData";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePreview } from "@/hooks/usePreview";
import { useFileUpload } from "@/hooks/useFileUpload";
import { usePositioning } from "@/hooks/usePositioning";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useEmailConfig } from "@/hooks/useEmailConfig";
import { usePdfGeneration } from "@/hooks/usePdfGeneration";
import {
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward
} from "lucide-react";
import { CertificatePreview } from "@/components/CertificatePreview";
import { DataPanel } from "@/components/panels/DataPanel";
import { FormattingPanel } from "@/components/panels/FormattingPanel";
import { EmailConfigPanel } from "@/components/panels/EmailConfigPanel";
import { PdfGenerationModal } from "@/components/modals/PdfGenerationModal";
import { IndividualPdfsModal } from "@/components/modals/IndividualPdfsModal";
import { ConfirmationModals } from "@/components/modals/ConfirmationModals";
import { COLORS, GRADIENTS } from "@/utils/styles";



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
      style={{ backgroundColor: COLORS.background }}>
      <header
        className="py-4 px-6"
        style={{
          background: GRADIENTS.primary,
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
              <h1 className="text-2xl font-bold" style={{ color: COLORS.amber }}>
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
                backgroundColor: activeTab === "data" ? COLORS.tabActive : COLORS.tabInactive,
                color: activeTab === "data" ? COLORS.tabTextActive : COLORS.tabText
              }}>
              Data
            </button>
            <button
              onClick={() => setActiveTab("formatting")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              style={{
                backgroundColor:
                  activeTab === "formatting" ? COLORS.tabActive : COLORS.tabInactive,
                color: activeTab === "formatting" ? COLORS.tabTextActive : COLORS.tabText
              }}>
              Formatting
            </button>
            {detectedEmailColumn && (
              <button
                onClick={() => setActiveTab("email")}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center"
                style={{
                  backgroundColor:
                    activeTab === "email" ? COLORS.tabActive : COLORS.tabInactive,
                  color: activeTab === "email" ? COLORS.tabTextActive : COLORS.tabText
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
                          activeTab === "email" ? COLORS.amber : COLORS.successLight,
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
            <EmailConfigPanel
              detectedEmailColumn={detectedEmailColumn}
              emailConfig={emailConfig}
              setEmailConfig={setEmailConfig}
              selectedField={selectedField}
              setSelectedField={setSelectedField}
              setShowCenterGuide={setShowCenterGuide}
            />
          )}
        </div>
      </main>
      <PdfGenerationModal
        isGenerating={isGenerating}
        generatedPdfUrl={generatedPdfUrl}
        handleDownloadPdf={handleDownloadPdf}
        setGeneratedPdfUrl={setGeneratedPdfUrl}
        onClose={() => setGeneratedPdfUrl(null)}
      />

      <IndividualPdfsModal
        isGeneratingIndividual={isGeneratingIndividual}
        individualPdfsData={individualPdfsData}
        tableData={tableData}
        selectedNamingColumn={selectedNamingColumn}
        setSelectedNamingColumn={setSelectedNamingColumn}
        emailSendingStatus={emailSendingStatus}
        hasEmailColumn={hasEmailColumn}
        emailConfig={emailConfig}
        sendCertificateEmail={sendCertificateEmail}
        setIndividualPdfsData={setIndividualPdfsData}
        onClose={() => {
          setIndividualPdfsData(null);
          setSelectedNamingColumn("");
        }}
      />

      <ConfirmationModals
        showResetFieldModal={showResetFieldModal}
        setShowResetFieldModal={setShowResetFieldModal}
        showClearAllModal={showClearAllModal}
        setShowClearAllModal={setShowClearAllModal}
        selectedField={selectedField}
        positions={positions}
        setPositions={setPositions}
        tableData={tableData}
      />
    </div>
  );
}

