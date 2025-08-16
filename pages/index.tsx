"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useTable, Column } from "react-table";
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
import { useClientPdfGeneration } from "@/hooks/useClientPdfGeneration";
// Removed ProgressivePdfModal - now using unified IndividualPdfsModal
import { SPLIT_BUTTON_THEME } from "@/utils/constants";
import {
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Save,
  FileUp,
  FolderOpen,
  RefreshCw
} from "lucide-react";
import { CertificatePreview } from "@/components/CertificatePreview";
import { DataPanelWithSearch } from "@/components/panels/DataPanelWithSearch";
import { FormattingPanel } from "@/components/panels/FormattingPanel";
import { EmailConfigPanel } from "@/components/panels/EmailConfigPanel";
import { PdfGenerationModal } from "@/components/modals/PdfGenerationModal";
import { IndividualPdfsModal } from "@/components/modals/IndividualPdfsModal";
import { ConfirmationModals } from "@/components/modals/ConfirmationModals";
import { SaveTemplateModal } from "@/components/modals/SaveTemplateModal";
import { LoadTemplateModal } from "@/components/modals/LoadTemplateModal";
import { NewTemplateModal } from "@/components/modals/NewTemplateModal";
import { ErrorModal } from "@/components/ui/error-alert";
import { MobileWarningScreen } from "@/components/MobileWarningScreen";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import { COLORS, GRADIENTS } from "@/utils/styles";
import { SplitButton } from "@/components/ui/split-button";
import { useToast, ToastContainer } from "@/components/ui/toast";
import { useTemplateAutosave } from "@/hooks/useTemplateAutosave";
import { useSessionAutosave } from "@/hooks/useSessionAutosave";
import { useDevMode } from "@/hooks/useDevMode";
import { DevModeControls } from "@/components/DevModeControls";
import { usePdfGenerationMethods } from "@/hooks/usePdfGenerationMethods";
import { useTemplateManagement } from "@/hooks/useTemplateManagement";
import { useOnboarding } from "@/hooks/useOnboarding";
import { OnboardingModal } from "@/components/modals/OnboardingModal";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { HelpCircle } from "lucide-react";
import { SAMPLE_CERTIFICATE_DATA, SAMPLE_EMAIL_TEMPLATE } from "@/utils/sampleData";

export default function HomePage() {
  // ============================================================================
  // MOBILE DETECTION
  // ============================================================================

  const { isMobile, isLoading: isMobileLoading } = useMobileDetection();
  const [forceMobileAccess, setForceMobileAccess] = useState(false);

  // ============================================================================
  // ONBOARDING & TUTORIAL
  // ============================================================================
  
  const {
    showOnboarding,
    hasSeenOnboarding,
    startTour,
    restartTour,
    skipOnboarding,
    setShowOnboarding,
    driverInstance
  } = useOnboarding();

  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);

  // Check if user is completely new (show welcome screen)
  useEffect(() => {
    if (!hasSeenOnboarding && !isMobileLoading && !isMobile) {
      setShowWelcomeScreen(true);
    }
  }, [hasSeenOnboarding, isMobileLoading, isMobile]);


  // ============================================================================
  // STATE & DATA MANAGEMENT
  // ============================================================================

  const isDevelopment = process.env.NODE_ENV === "development";

  // Dev mode state (defined early to avoid dependency issues)
  const [devMode, setDevMode] = useState<boolean>(false);
  const [emailTemplate, setEmailTemplate] = useState<string>("");
  const [numTestEmails, setNumTestEmails] = useState<number>(10);

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
    clearData,
    loadSessionData
  } = useTableData();

  // ============================================================================
  // CUSTOM HOOKS FOR FEATURE MANAGEMENT
  // ============================================================================

  // Positioning hook
  const { positions, setPositions, changeAlignment, clearPositions } =
    usePositioning({ tableData });
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "formatting" | "email">(
    "data"
  );
  const [showAppliedMessage, setShowAppliedMessage] = useState<boolean>(false);
  const [selectedNamingColumn, setSelectedNamingColumn] = useState<string>("");
  const [showResetFieldModal, setShowResetFieldModal] =
    useState<boolean>(false);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [hasInputFocus, setHasInputFocus] = useState<boolean>(false);

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
    console.log(
      "👀 Email tab visibility check - detectedEmailColumn:",
      detectedEmailColumn,
      "activeTab:",
      activeTab
    );
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
    clearError,
    localBlobUrl,
    uploadToServer
  } = useFileUpload();

  // Onboarding handlers (must come after file upload hook)
  const handleLoadSampleData = useCallback(() => {
    // Create a fake event to pass the sample data
    const fakeEvent = {
      target: { value: SAMPLE_CERTIFICATE_DATA }
    } as React.ChangeEvent<HTMLTextAreaElement>;
    handleTableDataChange(fakeEvent);
    setEmailTemplate(SAMPLE_EMAIL_TEMPLATE);
    setShowWelcomeScreen(false);
  }, [handleTableDataChange, setEmailTemplate]);

  const handleUseSampleTemplate = useCallback(async () => {
    try {
      const response = await fetch('/api/sample-template');
      const data = await response.json();
      if (data.success && data.imageUrl) {
        // Set the uploaded file URL directly for the sample template
        setUploadedFileUrl(data.imageUrl);
        setUploadedFile('sample-template.png');
      }
    } catch (error) {
      console.error('Failed to load sample template:', error);
    }
  }, [setUploadedFileUrl, setUploadedFile]);

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

  // Client-side PDF generation hook (always enabled)
  const {
    isClientSupported,
    isGenerating: isClientGenerating,
    isGeneratingIndividual: isClientGeneratingIndividual,
    generatedPdfUrl: clientGeneratedPdfUrl,
    individualPdfsData: clientIndividualPdfsData,
    generatePdf: generateClientPdf,
    generateIndividualPdfs: generateClientIndividualPdfs,
    handleDownloadPdf: handleClientDownloadPdf,
    clearPdfData: clearClientPdfData
  } = useClientPdfGeneration({
    tableData,
    positions,
    uploadedFile,
    uploadedFileUrl,
    localBlobUrl,
    selectedNamingColumn,
    setSelectedNamingColumn,
    enabled: true // Always enabled, client-side is default
  });

  // Mark variables as intentionally unused (kept for future features)
  void isClientGenerating;
  void handleClientDownloadPdf;

  // PDF generation methods hook
  const { handleGeneratePdf, handleGenerateIndividualPdfs } = usePdfGenerationMethods({
    isDevelopment,
    devMode,
    isClientSupported,
    tableData,
    localBlobUrl,
    uploadedFileUrl,
    generatePdf,
    generateIndividualPdfs,
    startProgressiveGeneration,
    setGeneratedPdfUrl,
    setIndividualPdfsData,
    generateClientPdf,
    generateClientIndividualPdfs,
    clientGeneratedPdfUrl,
    clientIndividualPdfsData,
    uploadToServer
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

  // Dev mode hook (must come after file upload, PDF generation, and email config hooks)
  const { handleDevModeToggle, handleEmailTemplateUpdate } = useDevMode({
    isDevelopment,
    devMode,
    setDevMode,
    emailTemplate,
    setEmailTemplate,
    numTestEmails,
    setNumTestEmails,
    loadPresetData,
    clearData,
    clearFile,
    clearPositions,
    clearPdfData,
    setUploadedFileUrl,
    setUploadedFile,
    setEmailConfig
  });

  // Toast notifications
  const { toasts, showToast, hideToast } = useToast();

  // Early autosave hook for manual save function
  const { manualSave: baseManualSave } = useTemplateAutosave({
    positions,
    columns: Object.keys(tableData[0] || {}),
    emailConfig,
    certificateImageUrl: uploadedFileUrl,
    certificateFilename: uploadedFile as string | null,
    tableData,
    onAutosave: () => {
      // Silent autosave - no toast notification
      console.log("Project autosaved");
    },
    enabled: false, // Base hook is disabled, only used for manual save
    currentTemplateId: null,
    currentTemplateName: null
  });

  // Template management hook
  const {
    currentTemplateName,
    currentTemplateId,
    hasManuallySaved,
    showSaveTemplateModal,
    showLoadTemplateModal,
    showNewTemplateModal,
    setShowSaveTemplateModal,
    setShowLoadTemplateModal,
    setShowNewTemplateModal,
    handleLoadTemplate,
    handleSaveTemplateSuccess,
    handleSaveToCurrentTemplate,
    handleNewTemplate,
    confirmNewTemplate
  } = useTemplateManagement({
    setPositions,
    setEmailConfig,
    setUploadedFileUrl,
    setUploadedFile,
    loadSessionData,
    uploadToServer,
    showToast,
    manualSave: baseManualSave,
    uploadedFileUrl,
    uploadedFile,
    positions,
    emailConfig,
    tableData,
    clearFile,
    clearPositions,
    clearDragState,
    clearData
  });

  // Session data autosave hook (only enabled after manual save)
  useSessionAutosave({
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    enabled: hasManuallySaved && tableData.length > 0
  });

  // Template autosave hook - actually enables autosave after manual save
  useTemplateAutosave({
    positions,
    columns: Object.keys(tableData[0] || {}),
    emailConfig,
    certificateImageUrl: uploadedFileUrl,
    certificateFilename: uploadedFile as string | null,
    tableData,
    onAutosave: () => {
      // Silent autosave - no toast notification
      console.log("Project autosaved");
    },
    enabled: hasManuallySaved,
    currentTemplateId,
    currentTemplateName
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
  }, [setGeneratedPdfUrl, setIndividualPdfsData]); // Include setters for completeness

  // Track input focus state globally
  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true'
      ) {
        setHasInputFocus(true);
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.getAttribute('contenteditable') === 'true'
      ) {
        setHasInputFocus(false);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Keyboard shortcuts hook
  useKeyboardShortcuts({
    selectedField,
    isDragging,
    positions,
    setPositions,
    onEscapePressed: handleEscapePressed
  });


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

  const { headerGroups, rows, prepareRow } = useTable({
    columns,
    data: tableData
  });

  // ============================================================================
  // MOBILE DETECTION LOGIC
  // ============================================================================

  // Listen for force mobile access event
  useEffect(() => {
    const handleForceMobileAccess = () => {
      setForceMobileAccess(true);
    };

    window.addEventListener("forceMobileAccess", handleForceMobileAccess);
    return () =>
      window.removeEventListener("forceMobileAccess", handleForceMobileAccess);
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
              <h1
                className="text-2xl font-bold"
                style={{ color: COLORS.amber }}>
                Bamboobot
              </h1>
            </div>
            {/* Dev Mode Controls - Only visible in development */}
            <DevModeControls
              isDevelopment={isDevelopment}
              devMode={devMode}
              handleDevModeToggle={handleDevModeToggle}
              emailTemplate={emailTemplate}
              setEmailTemplate={setEmailTemplate}
              numTestEmails={numTestEmails}
              setNumTestEmails={setNumTestEmails}
              handleEmailTemplateUpdate={handleEmailTemplateUpdate}
            />
          </div>
          <div className="flex gap-3">
            {/* Help/Tutorial Button */}
            <Button
              onClick={() => setShowOnboarding(true)}
              variant="outline"
              className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
              data-tour="help-button"
            >
              <HelpCircle className="w-4 h-4" />
              Tutorial
            </Button>
            
            {/* Projects Split Button */}
            <SplitButton
              label={
                currentTemplateName 
                  ? `Save to "${currentTemplateName}"` 
                  : "Save project"
              }
              onClick={
                hasManuallySaved
                  ? handleSaveToCurrentTemplate // Save to current project
                  : () => setShowSaveTemplateModal(true)
              }
              disabled={false}
              variant="primary" // Always use primary variant to maintain consistent styling
              menuItems={[
                {
                  label: "New project",
                  icon: <FileUp className="h-4 w-4" />,
                  onClick: handleNewTemplate,
                  disabled:
                    !uploadedFileUrl && Object.keys(positions).length === 0
                },
                {
                  label: "Projects...",
                  icon: <FolderOpen className="h-4 w-4" />,
                  onClick: () => setShowLoadTemplateModal(true)
                },
                {
                  label: "Save as new project",
                  icon: <Save className="h-4 w-4" />,
                  onClick: () => setShowSaveTemplateModal(true),
                  disabled:
                    !uploadedFileUrl || Object.keys(positions).length === 0
                }
              ]}
              gradientClass={SPLIT_BUTTON_THEME.templates.gradient}
              dropdownColor={SPLIT_BUTTON_THEME.templates.dropdownColor}
              dropdownHoverColor={
                SPLIT_BUTTON_THEME.templates.dropdownHoverColor
              }
            />

            {/* Generate Split Button */}
            <SplitButton
              label="Generate"
              onClick={() => {
                handleGenerateIndividualPdfs();
              }}
              menuItems={[
                {
                  label: "Individual PDFs",
                  onClick: () => {
                    handleGenerateIndividualPdfs();
                  },
                  disabled:
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    isProgressiveGenerating ||
                    tableData.length === 0
                },
                {
                  label: "Single PDF",
                  onClick: () => handleGeneratePdf(),
                  disabled:
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    tableData.length === 0
                },
                // Server-side options only in dev mode
                ...(isDevelopment && devMode ? [
                  {
                    label: "──────────",
                    onClick: () => {},
                    disabled: true
                  },
                  {
                    label: "Individual PDFs (Server)",
                    onClick: () => {
                      handleGenerateIndividualPdfs(true);
                    },
                    disabled:
                      !uploadedFile ||
                      isGenerating ||
                      isGeneratingIndividual ||
                      isProgressiveGenerating ||
                      tableData.length === 0
                  },
                  {
                    label: "Single PDF (Server)",
                    onClick: () => handleGeneratePdf(true),
                    disabled:
                      !uploadedFile ||
                      isGenerating ||
                      isGeneratingIndividual ||
                      tableData.length === 0
                  }
                ] : [])
              ]}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                isProgressiveGenerating ||
                tableData.length === 0
              }
              gradientClass={SPLIT_BUTTON_THEME.generate.gradient}
              dropdownColor={SPLIT_BUTTON_THEME.generate.dropdownColor}
              dropdownHoverColor={
                SPLIT_BUTTON_THEME.generate.dropdownHoverColor
              }
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-[60%_40%] gap-6 p-6">
        {/* Certificate Preview Section */}
        <div className="bg-card p-4 rounded-lg shadow" data-tour="certificate-preview">
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
                  <SplitButton
                    label="Remove Background"
                    onClick={() => {
                      clearFile();
                      clearDragState();
                    }}
                    menuItems={[
                      {
                        label: "Replace Background",
                        icon: <RefreshCw className="h-4 w-4" />,
                        onClick: () => {
                          const fileInput = document.getElementById('replace-file-upload') as HTMLInputElement;
                          fileInput?.click();
                        }
                      }
                    ]}
                    variant="secondary"
                    className="bg-white"
                    dropUp={true}
                  />
                  <input
                    id="replace-file-upload"
                    type="file"
                    onChange={handleFileUpload}
                    accept="image/jpeg,image/png"
                    className="sr-only"
                  />
                </div>

                {/* Arrow key hint - center aligned */}
                {selectedField && (
                  <div className="flex items-center justify-center text-xs text-gray-500">
                    <span className={hasInputFocus ? "opacity-50" : ""}>
                      {hasInputFocus 
                        ? "Arrow key nudging disabled while editing"
                        : "Use arrow keys to nudge selected text (Shift for larger steps)"}
                    </span>
                  </div>
                )}

                {/* Navigation buttons - right aligned */}
                {tableData.length > 0 && (
                  <div className="flex items-center gap-2" data-tour="navigation">
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
              data-tour="data-tab"
              style={{
                backgroundColor:
                  activeTab === "data" ? COLORS.tabActive : COLORS.tabInactive,
                color:
                  activeTab === "data" ? COLORS.tabTextActive : COLORS.tabText
              }}>
              Data
            </button>
            <button
              onClick={() => setActiveTab("formatting")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              data-tour="formatting-tab"
              style={{
                backgroundColor:
                  activeTab === "formatting"
                    ? COLORS.tabActive
                    : COLORS.tabInactive,
                color:
                  activeTab === "formatting"
                    ? COLORS.tabTextActive
                    : COLORS.tabText
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
                data-tour="email-tab"
                style={{
                  backgroundColor:
                    activeTab === "email"
                      ? COLORS.tabActive
                      : COLORS.tabInactive,
                  color:
                    activeTab === "email"
                      ? COLORS.tabTextActive
                      : COLORS.tabText
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
                          activeTab === "email"
                            ? COLORS.amber
                            : COLORS.successLight,
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
        isGeneratingIndividual={
          isGeneratingIndividual || isProgressiveGenerating || isClientGeneratingIndividual
        }
        individualPdfsData={
          individualPdfsData || clientIndividualPdfsData ||
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
          if (clientIndividualPdfsData) {
            clearClientPdfData();
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

      {/* Template Modals */}
      <SaveTemplateModal
        isOpen={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        positions={positions}
        columns={Object.keys(tableData[0] || {})}
        tableData={tableData}
        emailConfig={emailConfig}
        certificateImageUrl={uploadedFileUrl || undefined}
        certificateFilename={(uploadedFile as string) || undefined}
        onSaveSuccess={handleSaveTemplateSuccess}
        onManualSave={async (templateName) => {
          let finalUrl = uploadedFileUrl;
          let finalFilename = uploadedFile as string;
          
          // Ensure file is uploaded to server before saving project
          // Check if we're using a blob URL (local file not yet uploaded)
          if (uploadedFileUrl?.startsWith('blob:')) {
            console.log('Uploading file to server before saving project...');
            try {
              const uploadResult = await uploadToServer();
              if (uploadResult) {
                finalUrl = uploadResult.image;
                finalFilename = uploadResult.filename;
                console.log("File uploaded, using server URL:", finalUrl);
              }
            } catch (error) {
              console.error('Failed to upload file before saving:', error);
              return { success: false, error: 'Failed to upload file to server' };
            }
          }
          return baseManualSave(templateName, finalUrl ?? undefined, finalFilename ?? undefined);
        }}
      />

      <LoadTemplateModal
        isOpen={showLoadTemplateModal}
        onClose={() => setShowLoadTemplateModal(false)}
        onLoadTemplate={handleLoadTemplate}
      />

      <NewTemplateModal
        isOpen={showNewTemplateModal}
        onClose={() => setShowNewTemplateModal(false)}
        onConfirm={confirmNewTemplate}
        hasUnsavedWork={
          uploadedFileUrl !== null && Object.keys(positions).length > 0
        }
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={hideToast} />

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
            document.getElementById("file-upload")?.click();
          }}
        />
      )}

      {/* Welcome Screen for first-time users */}
      {showWelcomeScreen && (
        <WelcomeScreen
          onStartTour={() => {
            setShowWelcomeScreen(false);
            
            // Wait for WelcomeScreen to be removed from DOM before starting tour
            setTimeout(() => {
              startTour();
            }, 300);
          }}
          onLoadSampleData={handleLoadSampleData}
          onUseSampleTemplate={handleUseSampleTemplate}
          onSkip={() => {
            setShowWelcomeScreen(false);
            skipOnboarding();
          }}
        />
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onStartTour={() => {
          setShowOnboarding(false);
          setShowWelcomeScreen(false); // CRITICAL: Dismiss the WelcomeScreen!
          // Wait for WelcomeScreen to be removed from DOM before starting tour
          setTimeout(() => {
            startTour();
          }, 300);
        }}
        onSkip={() => {
          setShowOnboarding(false);
          skipOnboarding();
        }}
      />
    </div>
  );
}
