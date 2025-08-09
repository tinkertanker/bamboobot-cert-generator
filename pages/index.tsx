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
import { PROGRESSIVE_PDF, SPLIT_BUTTON_THEME } from "@/utils/constants";
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
import type { SavedTemplate } from "@/lib/template-storage";
import { SplitButton } from "@/components/ui/split-button";
import { useToast, ToastContainer } from "@/components/ui/toast";
import { useTemplateAutosave } from "@/hooks/useTemplateAutosave";
import { TemplateStorage } from "@/lib/template-storage";
import { useSessionAutosave } from "@/hooks/useSessionAutosave";
import { SessionStorage } from "@/lib/session-storage";

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
  const isDevelopment = process.env.NODE_ENV === "development";
  const presetCSVData = isDevelopment
    ? `Name,Department,Email
Maximilienne Featherstone-Harrington III,Executive Leadership,a@a.com
Bartholomäus von Quackenbusch-Wetherell,Innovation & Strategy,b@b.com
Anastasiopolis Meridienne Calderón-Rutherford,Global Operations,c@c.com`
    : "";

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

  const [devMode, setDevMode] = useState<boolean>(false);
  const [emailTemplate, setEmailTemplate] = useState<string>("");
  const [numTestEmails, setNumTestEmails] = useState<number>(10);
  // Client-side is default (true), server-side is only for dev mode
  const [forceServerSide, setForceServerSide] = useState<boolean>(false);

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
  const [showSaveTemplateModal, setShowSaveTemplateModal] =
    useState<boolean>(false);
  const [showLoadTemplateModal, setShowLoadTemplateModal] =
    useState<boolean>(false);
  const [showNewTemplateModal, setShowNewTemplateModal] =
    useState<boolean>(false);
  const [hasManuallySaved, setHasManuallySaved] = useState<boolean>(false);
  const [currentTemplateName, setCurrentTemplateName] = useState<string | null>(
    null
  );
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(
    null
  );
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
    progress: clientProgress,
    stage: clientStage,
    generatedPdfUrl: clientGeneratedPdfUrl,
    individualPdfsData: clientIndividualPdfsData,
    generatePdf: generateClientPdf,
    generateIndividualPdfs: generateClientIndividualPdfs,
    handleDownloadPdf: handleClientDownloadPdf,
    clearPdfData: clearClientPdfData,
    getCapabilityReport
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

  // Wrapper functions for PDF generation (choose client or server)
  // Transfer client-generated PDF URLs to main state when they change
  useEffect(() => {
    if (clientGeneratedPdfUrl) {
      console.log("Transferring client PDF URL to main state:", clientGeneratedPdfUrl);
      setGeneratedPdfUrl(clientGeneratedPdfUrl);
    }
  }, [clientGeneratedPdfUrl, setGeneratedPdfUrl]);

  useEffect(() => {
    if (clientIndividualPdfsData) {
      console.log("Transferring client individual PDFs to main state:", clientIndividualPdfsData.length, "files");
      setIndividualPdfsData(clientIndividualPdfsData);
    }
  }, [clientIndividualPdfsData, setIndividualPdfsData]);

  const handleGeneratePdf = useCallback(async (useServer = false) => {
    // Use server-side only if explicitly requested AND in dev mode
    if (useServer && isDevelopment && devMode) {
      console.log("📡 Using SERVER-SIDE PDF generation (Dev Mode)");
      // Ensure file is uploaded for server-side generation
      if (localBlobUrl && !uploadedFileUrl?.startsWith('http')) {
        console.log('Uploading file to server for server-side generation...');
        await uploadToServer();
      }
      await generatePdf();
    } else if (isClientSupported && !forceServerSide) {
      // Default to client-side if supported
      console.log("🚀 Using CLIENT-SIDE PDF generation");
      await generateClientPdf();
    } else {
      // Fallback to server if client not supported
      console.log("📡 Using SERVER-SIDE PDF generation (Fallback)");
      // Ensure file is uploaded for server-side generation
      if (localBlobUrl && !uploadedFileUrl?.startsWith('http')) {
        console.log('Uploading file to server for server-side generation...');
        await uploadToServer();
      }
      await generatePdf();
    }
  }, [
    isDevelopment,
    devMode,
    isClientSupported,
    forceServerSide,
    generateClientPdf,
    generatePdf,
    localBlobUrl,
    uploadedFileUrl,
    uploadToServer
  ]);

  const handleGenerateIndividualPdfs = useCallback(async (useServer = false) => {
    // Use server-side only if explicitly requested AND in dev mode
    if (useServer && isDevelopment && devMode) {
      // Ensure file is uploaded for server-side generation
      if (localBlobUrl && !uploadedFileUrl?.startsWith('http')) {
        console.log('Uploading file to server for server-side generation...');
        await uploadToServer();
      }
      // Server-side generation (Dev Mode only)
      if (tableData.length > PROGRESSIVE_PDF.TRIGGER_THRESHOLD) {
        console.log(`📡 Using PROGRESSIVE SERVER-SIDE generation for ${tableData.length} rows (Dev Mode)`);
        await startProgressiveGeneration('individual');
      } else {
        console.log(`📡 Using SERVER-SIDE generation for ${tableData.length} rows (Dev Mode)`);
        await generateIndividualPdfs();
      }
    } else if (isClientSupported && !forceServerSide) {
      // Default to client-side if supported
      console.log(`🚀 Using CLIENT-SIDE generation for ${tableData.length} rows`);
      if (tableData.length > PROGRESSIVE_PDF.TRIGGER_THRESHOLD) {
        console.log(`   ⚠️ Note: Large dataset - using progressive generation`);
        // TODO: Implement progressive/batch generation in client for better memory management
      }
      await generateClientIndividualPdfs();
      // Note: Results are automatically set in clientIndividualPdfsData
      // The modal will pick them up via the props
    } else {
      // Fallback to server if client not supported
      // Ensure file is uploaded for server-side generation
      if (localBlobUrl && !uploadedFileUrl?.startsWith('http')) {
        console.log('Uploading file to server for server-side generation...');
        await uploadToServer();
      }
      if (tableData.length > PROGRESSIVE_PDF.TRIGGER_THRESHOLD) {
        console.log(`📡 Using PROGRESSIVE SERVER-SIDE generation for ${tableData.length} rows (Fallback)`);
        await startProgressiveGeneration('individual');
      } else {
        console.log(`📡 Using SERVER-SIDE generation for ${tableData.length} rows (Fallback)`);
        await generateIndividualPdfs();
      }
    }
  }, [
    isDevelopment,
    devMode,
    isClientSupported,
    forceServerSide,
    generateClientIndividualPdfs,
    generateIndividualPdfs,
    startProgressiveGeneration,
    tableData.length,
    clientIndividualPdfsData,
    setIndividualPdfsData,
    localBlobUrl,
    uploadedFileUrl,
    uploadToServer
  ]);

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

  // Toast notifications
  const { toasts, showToast, hideToast } = useToast();

  // Template autosave hook - updates existing template after manual save
  const { manualSave } = useTemplateAutosave({
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

  // Session data autosave hook (only enabled after manual save)
  useSessionAutosave({
    tableData,
    tableInput,
    isFirstRowHeader,
    useCSVMode,
    enabled: hasManuallySaved && tableData.length > 0
  });

  // Load most recent template and session data on startup
  useEffect(() => {
    const loadStartupData = async () => {
      try {
        // First, try to load session data
        const session = SessionStorage.loadSession();
        if (session) {
          console.log("Loading saved session data");

          // Check if session is not too old (24 hours)
          const sessionAge = SessionStorage.getSessionAge();
          if (sessionAge && sessionAge < 24 * 60 * 60 * 1000) {
            // Load the table data with explicit settings
            await loadSessionData(
              session.tableInput,
              session.useCSVMode,
              session.isFirstRowHeader
            );

            showToast({
              message: "Session data restored",
              type: "info",
              duration: 2000
            });
          } else {
            // Session too old, clear it
            SessionStorage.clearSession();
          }
        }

        // Then load the most recent template
        const template = await TemplateStorage.getMostRecentTemplate();

        if (template) {
          console.log("Loading most recent template:", template.name);

          // Load the positions
          setPositions(template.positions);

          // Load email configuration if present
          if (template.emailConfig) {
            setEmailConfig(template.emailConfig);
          }

          // Load the certificate image
          if (template.certificateImage.url) {
            setUploadedFileUrl(template.certificateImage.url);
            setUploadedFile(template.certificateImage.filename);
          }

          showToast({
            message: `Loaded project: ${template.name}`,
            type: "info",
            duration: 3000
          });

          // Enable autosave since we loaded saved work
          setHasManuallySaved(true);
          setCurrentTemplateName(template.name);
        }
      } catch (error) {
        console.error("Error loading startup data:", error);
      }
    };

    // Only load on initial mount
    loadStartupData();
  }, [
    loadSessionData,
    setEmailConfig,
    setPositions,
    setUploadedFile,
    setUploadedFileUrl,
    showToast
  ]); // Include stable dependencies

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

  // Template handlers
  const handleLoadTemplate = useCallback(
    async (template: SavedTemplate) => {
      // Load the positions
      setPositions(template.positions);

      // Load the table data
      if (template.tableData && template.tableData.length > 0) {
        // Convert tableData array back to TSV format for loading
        const headers = template.columns;
        const rows = template.tableData.map(row => {
          return headers.map(col => row[col] || "").join("\t");
        });
        const tsvData = [headers.join("\t"), ...rows].join("\n");
        
        // Load the data using loadSessionData
        const IS_BINARY = false;
        const HAS_HEADERS = true;
        await loadSessionData(tsvData, IS_BINARY, HAS_HEADERS);
        console.log(`Loaded ${template.tableData.length} rows of data`);
      } else if (template.columns.length > 0) {
        // If no data but has columns, create empty row with those columns
        const headers = template.columns;
        const emptyRow = headers.map(() => "").join("\t");
        const tsvData = [headers.join("\t"), emptyRow].join("\n");
        
        const IS_BINARY = false;
        const HAS_HEADERS = true;
        await loadSessionData(tsvData, IS_BINARY, HAS_HEADERS);
        console.log("Project expects columns:", template.columns);
      }

      // Load email configuration if present
      if (template.emailConfig) {
        setEmailConfig(template.emailConfig);
      }
      
      // Set current template info and enable autosave
      setCurrentTemplateId(template.id);
      setCurrentTemplateName(template.name);
      setHasManuallySaved(true);

      // Update the certificate image URL and file
      if (template.certificateImage.url) {
        setUploadedFileUrl(template.certificateImage.url);
        setUploadedFile(template.certificateImage.filename);
      }

      console.log("Project loaded successfully:", template.name);
      // Enable autosave after loading a template
      setHasManuallySaved(true);
      setCurrentTemplateName(template.name);
    },
    [
      setPositions,
      setEmailConfig,
      setUploadedFileUrl,
      setUploadedFile,
      uploadedFileUrl,
      loadSessionData
    ]
  );

  const handleSaveTemplateSuccess = useCallback(
    (templateId: string, templateName: string) => {
      console.log("Project saved successfully:", {
        id: templateId,
        name: templateName
      });
      showToast({
        message: `Project "${templateName}" saved successfully`,
        type: "success",
        duration: 3000
      });
      setShowSaveTemplateModal(false);
      // Enable autosave after manual save
      setHasManuallySaved(true);
      setCurrentTemplateName(templateName);
      setCurrentTemplateId(templateId);
    },
    [showToast]
  );

  // Save to current template (no modal)
  const handleSaveToCurrentTemplate = useCallback(async () => {
    if (!currentTemplateName || !uploadedFileUrl || !uploadedFile) return;

    const result = await manualSave(currentTemplateName);

    if (result.success) {
      // Show subtle feedback that it was saved
      showToast({
        message: "Project saved",
        type: "success",
        duration: 2000
      });
    } else {
      showToast({
        message: result.error || "Failed to save project",
        type: "error",
        duration: 3000
      });
    }
  }, [
    currentTemplateName,
    uploadedFileUrl,
    uploadedFile,
    manualSave,
    showToast
  ]);

  // Handle new template
  const handleNewTemplate = useCallback(() => {
    // Check if there's any work to save
    const hasWork =
      uploadedFileUrl && (Object.keys(positions).length > 0 || emailConfig);

    if (hasWork) {
      setShowNewTemplateModal(true);
    } else {
      // No work to save, just clear everything
      clearFile();
      clearPositions();
      clearDragState();
      setEmailConfig({
        senderName: "",
        subject: "",
        message: "",
        deliveryMethod: "download",
        isConfigured: false
      });
    }
  }, [
    uploadedFileUrl,
    positions,
    emailConfig,
    clearFile,
    clearPositions,
    clearDragState,
    setEmailConfig
  ]);

  const confirmNewTemplate = useCallback(() => {
    clearFile();
    clearPositions();
    clearDragState();
    clearData(); // Clear table data
    SessionStorage.clearSession(); // Clear saved session
    setEmailConfig({
      senderName: "",
      subject: "",
      message: "",
      deliveryMethod: "download",
      isConfigured: false
    });
    setShowNewTemplateModal(false);
    setHasManuallySaved(false); // Reset autosave state
    setCurrentTemplateName(null); // Reset template name
    setCurrentTemplateId(null); // Reset template ID
    showToast({
      message: "New project started",
      type: "info",
      duration: 2000
    });
  }, [
    clearFile,
    clearPositions,
    clearDragState,
    clearData,
    setEmailConfig,
    showToast
  ]);

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
  // DEV MODE HELPER FUNCTIONS
  // ============================================================================

  const generateEmailTestData = (baseEmail: string, count: number): string => {
    if (!baseEmail || !baseEmail.includes("@")) {
      return presetCSVData; // Fallback to original preset data
    }

    const [localPart, domain] = baseEmail.split("@");
    const headers = "Name,Department,Email";
    const rows = Array.from({ length: count }, (_, i) => {
      const emailWithPlus = `${localPart}+${i + 1}@${domain}`;
      const names = [
        "Alex Johnson",
        "Jordan Smith",
        "Casey Brown",
        "Riley Davis",
        "Morgan Wilson",
        "Avery Miller",
        "Quinn Garcia",
        "Blake Martinez",
        "Cameron Anderson",
        "Drew Taylor",
        "Ellis Thompson",
        "Finley White",
        "Harper Lewis",
        "Indigo Clark",
        "Jamie Rodriguez",
        "Kai Walker",
        "Lane Robinson",
        "Micah Hall",
        "Nova Young",
        "Oakley King"
      ];
      const departments = [
        "Engineering",
        "Marketing",
        "Sales",
        "HR",
        "Finance",
        "Operations",
        "Design",
        "Legal",
        "Research",
        "Support"
      ];

      const name = names[i % names.length];
      const department = departments[i % departments.length];

      return `${name},${department},${emailWithPlus}`;
    });

    return [headers, ...rows].join("\n");
  };

  // ============================================================================
  // DEV MODE HANDLER (after hooks)
  // ============================================================================

  const handleEmailTemplateUpdate = () => {
    if (!isDevelopment || !devMode) return;

    console.log("🔧 Dev Mode: Updating email template data...");
    const testData = emailTemplate
      ? generateEmailTestData(emailTemplate, numTestEmails)
      : presetCSVData;
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
        const testData = emailTemplate
          ? generateEmailTestData(emailTemplate, numTestEmails)
          : presetCSVData;
        
        // Load data asynchronously
        loadPresetData(testData).then(() => {
          console.log("🔧 Dev Mode: Data loaded successfully");
        }).catch(err => {
          console.error("🔧 Dev Mode: Failed to load data:", err);
        });

        // Use existing template files in dev mode
        if (isDevelopment) {
          const existingImage = "/template_images/dev-mode-template.jpg"; // Dev mode template
          console.log("🔧 Dev Mode: Setting template image:", existingImage);
          setUploadedFileUrl(existingImage);
        }

        // Use the dev mode template PDF
        const existingPdf = "dev-mode-template.pdf"; // Using dev mode template
        const mockFile = new File([""], existingPdf, {
          type: "application/pdf"
        });
        setUploadedFile(mockFile);
        console.log("🔧 Dev Mode: Using existing PDF:", existingPdf);

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

                {/* Server-side PDF Toggle - Only when dev mode is on */}
                {devMode && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 rounded-lg border border-yellow-200">
                    <input
                      type="checkbox"
                      id="server-pdf-toggle"
                      checked={forceServerSide}
                      onChange={(e) => {
                        setForceServerSide(e.target.checked);
                        console.log(`📄 PDF Generation: ${e.target.checked ? 'SERVER-SIDE 📡' : 'CLIENT-SIDE 🚀'}`);
                        if (!e.target.checked && isClientSupported) {
                          // Log capability report when switching to client
                          getCapabilityReport().then(report => {
                            console.log(report);
                          });
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="server-pdf-toggle"
                      className="text-sm font-medium text-yellow-700">
                      Force Server-Side
                    </label>
                    {!forceServerSide && clientStage && (
                      <span className="text-xs text-blue-600 ml-2">
                        Client: {clientStage} {clientProgress > 0 && `${Math.round(clientProgress * 100)}%`}
                      </span>
                    )}
                  </div>
                )}

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
                      onChange={(e) =>
                        setNumTestEmails(parseInt(e.target.value) || 10)
                      }
                      className="w-12 px-1 py-1 text-xs border rounded text-center"
                    />
                    <button
                      onClick={handleEmailTemplateUpdate}
                      className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                      disabled={!emailTemplate || !emailTemplate.includes("@")}>
                      Generate
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3">
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
          // Ensure file is uploaded to server before saving project
          if (localBlobUrl && !uploadedFileUrl?.startsWith('http')) {
            console.log('Uploading file to server before saving project...');
            try {
              await uploadToServer();
              // Wait a moment for state to update
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              console.error('Failed to upload file before saving:', error);
              return { success: false, error: 'Failed to upload file to server' };
            }
          }
          return manualSave(templateName);
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
    </div>
  );
}
