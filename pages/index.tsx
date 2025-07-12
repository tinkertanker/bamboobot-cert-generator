"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import {
  useTable,
  Column
} from "react-table";
import { useTableData } from "@/hooks/useTableData";
import type { TableData } from "@/types/certificate";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePreview } from "@/hooks/usePreview";
import { useFileUpload } from "@/hooks/useFileUpload";
import { usePositioning } from "@/hooks/usePositioning";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useEmailConfig } from "@/hooks/useEmailConfig";
import { usePdfGeneration } from "@/hooks/usePdfGeneration";
import { useProgressivePdfGeneration } from "@/hooks/useProgressivePdfGeneration";
// Removed ProgressivePdfModal - now using unified IndividualPdfsModal
import { PROGRESSIVE_PDF } from "@/utils/constants";
import {
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward
} from "lucide-react";
import { CertificatePreview } from "@/components/CertificatePreview";
import { DataPanelWithSearch } from "@/components/panels/DataPanelWithSearch";
import { FormattingPanel } from "@/components/panels/FormattingPanel";
import { EmailConfigPanel } from "@/components/panels/EmailConfigPanel";
import { PdfGenerationModal } from "@/components/modals/PdfGenerationModal";
import { IndividualPdfsModal } from "@/components/modals/IndividualPdfsModal";
import { ConfirmationModals } from "@/components/modals/ConfirmationModals";
import { ErrorModal } from "@/components/ui/error-alert";
import { MobileWarningScreen } from "@/components/MobileWarningScreen";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import { COLORS, GRADIENTS } from "@/utils/styles";



export default function HomePage() {
  // ============================================================================
  // MOBILE DETECTION
  // ============================================================================
  
  const { isMobile, isLoading: isMobileLoading } = useMobileDetection();
  const [forceMobileAccess, setForceMobileAccess] = useState(false);

  // ============================================================================
  // STATE & DATA MANAGEMENT
  // ============================================================================

  // Preset data for dev mode (only available in development)
  const isDevelopment = process.env.NODE_ENV === 'development';
  const presetCSVData = isDevelopment ? `Name,Department,Email
Maximilienne Featherstone-Harrington III,Executive Leadership,a@a.com
Bartholomäus von Quackenbusch-Wetherell,Innovation & Strategy,b@b.com
Anastasiopolis Meridienne Calderón-Rutherford,Global Operations,c@c.com` : '';

  // Table data management via custom hook
  const {
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    detectedEmailColumn,
    isProcessingData,
    handleTableDataChange,
    handleHeaderToggle,
    handleCSVModeToggle,
    loadPresetData,
    clearData
  } = useTableData();

  const [devMode, setDevMode] = useState<boolean>(false);
  const [emailTemplate, setEmailTemplate] = useState<string>('');
  const [numTestEmails, setNumTestEmails] = useState<number>(10);

  // ============================================================================
  // CUSTOM HOOKS FOR FEATURE MANAGEMENT
  // ============================================================================

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
    console.log("👀 Email tab visibility check - detectedEmailColumn:", detectedEmailColumn, "activeTab:", activeTab);
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
  } = usePreview(tableData.length, Object.keys(positions).length);

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
    clearFile,
    uploadError,
    clearError
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

  // Progressive PDF generation hook
  const {
    isGenerating: isProgressiveGenerating,
    progress: progressivePdfProgress,
    results: progressivePdfResults,
    error: progressivePdfError,
    startProgressiveGeneration,
    pauseGeneration,
    resumeGeneration,
    cancelGeneration,
    clearResults
  } = useProgressivePdfGeneration({
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

  // ============================================================================
  // EVENT HANDLERS & BUSINESS LOGIC
  // ============================================================================

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





  // ============================================================================
  // DEV MODE HELPER FUNCTIONS
  // ============================================================================
  
  const generateEmailTestData = (baseEmail: string, count: number): string => {
    if (!baseEmail || !baseEmail.includes('@')) {
      return presetCSVData; // Fallback to original preset data
    }
    
    const [localPart, domain] = baseEmail.split('@');
    const headers = 'Name,Department,Email';
    const rows = Array.from({ length: count }, (_, i) => {
      const emailWithPlus = `${localPart}+${i + 1}@${domain}`;
      const names = [
        'Alex Johnson', 'Jordan Smith', 'Casey Brown', 'Riley Davis', 'Morgan Wilson',
        'Avery Miller', 'Quinn Garcia', 'Blake Martinez', 'Cameron Anderson', 'Drew Taylor',
        'Ellis Thompson', 'Finley White', 'Harper Lewis', 'Indigo Clark', 'Jamie Rodriguez',
        'Kai Walker', 'Lane Robinson', 'Micah Hall', 'Nova Young', 'Oakley King'
      ];
      const departments = [
        'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 
        'Operations', 'Design', 'Legal', 'Research', 'Support'
      ];
      
      const name = names[i % names.length];
      const department = departments[i % departments.length];
      
      return `${name},${department},${emailWithPlus}`;
    });
    
    return [headers, ...rows].join('\n');
  };

  // ============================================================================
  // DEV MODE HANDLER (after hooks)
  // ============================================================================
  
  const handleEmailTemplateUpdate = () => {
    if (!isDevelopment || !devMode) return;
    
    console.log("🔧 Dev Mode: Updating email template data...");
    const testData = emailTemplate ? generateEmailTestData(emailTemplate, numTestEmails) : presetCSVData;
    loadPresetData(testData);
  };

  const handleDevModeToggle = () => {
    if (!isDevelopment) return; // Safety check - only works in development
    
    setDevMode((prev) => {
      const newValue = !prev;
      if (newValue) {
        console.log("🔧 Dev Mode: Enabling...");
        
        // Enable dev mode: load preset data and template
        console.log("🔧 Dev Mode: Loading preset data...");
        const testData = emailTemplate ? generateEmailTestData(emailTemplate, numTestEmails) : presetCSVData;
        loadPresetData(testData);

        // Set the uploaded file URL to the preset image (only in dev)
        if (isDevelopment) {
          const presetImageUrl = "/temp_images/certificate-template.png";
          console.log("🔧 Dev Mode: Setting template image:", presetImageUrl);
          setUploadedFileUrl(presetImageUrl);
        }

        // Create a mock file object for the preset template (use PDF filename)
        const mockFile = new File([""], "certificate-template.pdf", {
          type: "application/pdf"
        });
        setUploadedFile(mockFile);

        // Pre-fill email configuration in dev mode
        // Use setTimeout to ensure this runs after the email column detection
        setTimeout(() => {
          console.log("🔧 Dev Mode: Setting email config (delayed)...");
          // Don't log detectedEmailColumn here as it might be stale from closure
          setEmailConfig({
            senderName: "Bamboobot Testing",
            subject: "Your Certificate of Completion",
            message: `Hi there,

Congratulations on completing the program! Your certificate is ready.

Please find your certificate attached to this email or use the download link below.

Best regards,
Bamboobot
Email Sending Robot`,
            deliveryMethod: "download",
            isConfigured: true
          });
          console.log("🔧 Dev Mode: Email config set!");
        }, 500); // Increased delay to ensure email column detection completes first

        console.log("Dev mode enabled: preset template and data loaded");
      } else {
        // Disable dev mode: clear data
        clearData();
        clearFile();
        clearPositions();
        clearPdfData();
        setEmailConfig({
          senderName: "",
          subject: "",
          message: "",
          deliveryMethod: "download",
          isConfigured: false
        });
        console.log("Dev mode disabled: data cleared");
      }
      return newValue;
    });
  };

  // ============================================================================
  // TABLE CONFIGURATION
  // ============================================================================

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

  const { headerGroups, rows, prepareRow } =
    useTable({ columns, data: tableData });


  // ============================================================================
  // MOBILE DETECTION LOGIC
  // ============================================================================

  // Listen for force mobile access event
  useEffect(() => {
    const handleForceMobileAccess = () => {
      setForceMobileAccess(true);
    };
    
    window.addEventListener('forceMobileAccess', handleForceMobileAccess);
    return () => window.removeEventListener('forceMobileAccess', handleForceMobileAccess);
  }, []);

  // Show mobile warning if on mobile and haven't forced access
  if (!isMobileLoading && isMobile && !forceMobileAccess) {
    return <MobileWarningScreen />;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: COLORS.background }}>
      {/* Application Header */}
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
            {/* Dev Mode Controls - Only visible in development */}
            {isDevelopment && (
              <div className="flex items-center gap-3">
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
                
                {/* Email Template Controls - Only when dev mode is on */}
                {devMode && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
                    <input
                      type="email"
                      placeholder="test@gmail.com"
                      value={emailTemplate}
                      onChange={(e) => setEmailTemplate(e.target.value)}
                      className="w-40 px-2 py-1 text-xs border rounded"
                    />
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={numTestEmails}
                      onChange={(e) => setNumTestEmails(parseInt(e.target.value) || 10)}
                      className="w-12 px-1 py-1 text-xs border rounded text-center"
                    />
                    <button
                      onClick={handleEmailTemplateUpdate}
                      className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      disabled={!emailTemplate || !emailTemplate.includes('@')}>
                      Generate
                    </button>
                  </div>
                )}
              </div>
            )}
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
              onClick={() => {
                // Use progressive generation for large datasets
                if (tableData.length > PROGRESSIVE_PDF.AUTO_PROGRESSIVE_THRESHOLD) {
                  startProgressiveGeneration('individual');
                } else {
                  generateIndividualPdfs();
                }
              }}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                isProgressiveGenerating ||
                tableData.length === 0
              }
              gradient
              gradientType="coral"
              className="font-semibold px-6">
              {isGeneratingIndividual || isProgressiveGenerating
                ? "Generating..."
                : "Generate Individual PDFs"}
            </ActionButton>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-[60%_40%] gap-6 p-6">
        {/* Certificate Preview Section */}
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
        {/* Control Panel Section */}
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
                onClick={() => {
                  console.log("📧 Email tab clicked");
                  setActiveTab("email");
                }}
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
            <DataPanelWithSearch
              tableInput={tableInput}
              handleTableDataChange={handleTableDataChange}
              isFirstRowHeader={isFirstRowHeader}
              handleHeaderToggle={handleHeaderToggle}
              useCSVMode={useCSVMode}
              handleCSVModeToggle={handleCSVModeToggle}
              tableData={tableData}
              headerGroups={headerGroups}
              rows={rows}
              prepareRow={prepareRow}
              detectedEmailColumn={detectedEmailColumn}
              currentPreviewIndex={currentPreviewIndex}
              setCurrentPreviewIndex={setCurrentPreviewIndex}
              isProcessing={isProcessingData}
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

      {/* Modal Components */}
      <PdfGenerationModal
        isGenerating={isGenerating}
        generatedPdfUrl={generatedPdfUrl}
        handleDownloadPdf={handleDownloadPdf}
        setGeneratedPdfUrl={setGeneratedPdfUrl}
        onClose={() => setGeneratedPdfUrl(null)}
      />

      <IndividualPdfsModal
        isGeneratingIndividual={isGeneratingIndividual || isProgressiveGenerating}
        individualPdfsData={
          individualPdfsData || 
          (progressivePdfResults && progressivePdfResults.files.length > 0
            ? progressivePdfResults.files.map((file) => ({
                filename: file.filename,
                url: file.path,
                originalIndex: file.index
              }))
            : null)
        }
        tableData={tableData}
        selectedNamingColumn={selectedNamingColumn}
        setSelectedNamingColumn={setSelectedNamingColumn}
        emailSendingStatus={emailSendingStatus}
        hasEmailColumn={hasEmailColumn}
        emailConfig={emailConfig}
        sendCertificateEmail={sendCertificateEmail}
        setIndividualPdfsData={setIndividualPdfsData}
        detectedEmailColumn={detectedEmailColumn}
        // Progressive generation props
        isProgressiveMode={isProgressiveGenerating || !!progressivePdfProgress}
        progressiveProgress={progressivePdfProgress}
        progressiveError={progressivePdfError}
        onProgressivePause={pauseGeneration}
        onProgressiveResume={resumeGeneration}
        onProgressiveCancel={cancelGeneration}
        onClose={() => {
          setIndividualPdfsData(null);
          setSelectedNamingColumn("");
          if (isProgressiveGenerating || progressivePdfProgress) {
            clearResults();
          }
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

      {/* Progressive PDF Modal removed - now using unified IndividualPdfsModal */}

      {/* Error Modal */}
      {uploadError && (
        <ErrorModal
          open={true}
          title={uploadError.title}
          message={uploadError.message}
          action={uploadError.action}
          onClose={clearError}
          onRetry={() => {
            clearError();
            document.getElementById('file-upload')?.click();
          }}
        />
      )}
    </div>
  );
}

