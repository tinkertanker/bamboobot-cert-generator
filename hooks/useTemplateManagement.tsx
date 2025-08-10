import { useState, useCallback, useEffect } from "react";
import type { SavedTemplate } from "@/lib/template-storage";
import type { EmailConfig, TableData } from "@/types/certificate";
import { TemplateStorage } from "@/lib/template-storage";
import { SessionStorage } from "@/lib/session-storage";

interface UseTemplateManagementProps {
  // State setters
  setPositions: (positions: any) => void;
  setEmailConfig: (config: EmailConfig) => void;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFile: (file: File | string | null) => void;
  
  // Data loading
  loadSessionData: (data: string, isBinary: boolean, hasHeaders: boolean) => Promise<void>;
  
  // File upload
  uploadToServer: () => Promise<any>;
  
  // Toast notifications
  showToast: (options: { message: string; type: "success" | "error" | "info"; duration: number }) => void;
  
  // Template autosave
  manualSave: (name: string, url?: string, filename?: string) => Promise<{ success: boolean; error?: string }>;
  
  // Current state
  uploadedFileUrl: string | null;
  uploadedFile: File | string | null;
  positions: any;
  emailConfig: EmailConfig;
  tableData: TableData[];
  
  // Clear functions
  clearFile: () => void;
  clearPositions: () => void;
  clearDragState: () => void;
  clearData: () => void;
}

interface UseTemplateManagementReturn {
  currentTemplateName: string | null;
  currentTemplateId: string | null;
  hasManuallySaved: boolean;
  showSaveTemplateModal: boolean;
  showLoadTemplateModal: boolean;
  showNewTemplateModal: boolean;
  setShowSaveTemplateModal: (show: boolean) => void;
  setShowLoadTemplateModal: (show: boolean) => void;
  setShowNewTemplateModal: (show: boolean) => void;
  handleLoadTemplate: (template: SavedTemplate) => Promise<void>;
  handleSaveTemplateSuccess: (templateId: string, templateName: string) => void;
  handleSaveToCurrentTemplate: () => Promise<void>;
  handleNewTemplate: () => void;
  confirmNewTemplate: () => void;
}

export function useTemplateManagement({
  setPositions,
  setEmailConfig,
  setUploadedFileUrl,
  setUploadedFile,
  loadSessionData,
  uploadToServer,
  showToast,
  manualSave,
  uploadedFileUrl,
  uploadedFile,
  positions,
  emailConfig,
  tableData,
  clearFile,
  clearPositions,
  clearDragState,
  clearData
}: UseTemplateManagementProps): UseTemplateManagementReturn {
  const [currentTemplateName, setCurrentTemplateName] = useState<string | null>(null);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [hasManuallySaved, setHasManuallySaved] = useState<boolean>(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState<boolean>(false);
  const [showLoadTemplateModal, setShowLoadTemplateModal] = useState<boolean>(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState<boolean>(false);

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
    },
    [
      setPositions,
      setEmailConfig,
      setUploadedFileUrl,
      setUploadedFile,
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

    let finalUrl = uploadedFileUrl;
    let finalFilename = uploadedFile as string;

    // If the file hasn't been uploaded to server yet (blob URL), upload it first
    if (uploadedFileUrl.startsWith('blob:')) {
      console.log("Uploading file to server before saving project...");
      try {
        const uploadResult = await uploadToServer();
        if (uploadResult) {
          finalUrl = uploadResult.image;
          finalFilename = uploadResult.filename;
          console.log("File uploaded, using server URL:", finalUrl);
        }
      } catch (error) {
        console.error("Failed to upload file before saving:", error);
        showToast({
          message: "Failed to upload file to server",
          type: "error",
          duration: 3000
        });
        return;
      }
    }

    const result = await manualSave(currentTemplateName, finalUrl, finalFilename);

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
    uploadToServer,
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

  return {
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
  };
}