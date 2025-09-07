import { useState, useCallback, useEffect } from "react";
import type { SavedProject } from "@/lib/project-storage";
import type { EmailConfig, TableData } from "@/types/certificate";
import { ProjectStorage } from "@/lib/project-storage";
import { SessionStorage } from "@/lib/session-storage";

interface UseProjectManagementProps {
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
  
  // Project autosave
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

interface UseProjectManagementReturn {
  currentProjectName: string | null;
  currentProjectId: string | null;
  hasManuallySaved: boolean;
  showSaveProjectModal: boolean;
  showLoadProjectModal: boolean;
  showNewProjectModal: boolean;
  setShowSaveProjectModal: (show: boolean) => void;
  setShowLoadProjectModal: (show: boolean) => void;
  setShowNewProjectModal: (show: boolean) => void;
  handleLoadProject: (project: SavedProject) => Promise<void>;
  handleSaveProjectSuccess: (projectId: string, projectName: string) => void;
  handleSaveToCurrentProject: () => Promise<void>;
  handleNewProject: () => void;
  confirmNewProject: () => void;
}

export function useProjectManagement({
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
}: UseProjectManagementProps): UseProjectManagementReturn {
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [hasManuallySaved, setHasManuallySaved] = useState<boolean>(false);
  const [showSaveProjectModal, setShowSaveProjectModal] = useState<boolean>(false);
  const [showLoadProjectModal, setShowLoadProjectModal] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);

  // Load most recent project and session data on startup
  useEffect(() => {
    const loadStartupData = async () => {
      try {
        // Run migration on startup
        const migrationResult = ProjectStorage.migrateFromTemplateStorage();
        if (migrationResult.migrated > 0) {
          console.log(`Migrated ${migrationResult.migrated} templates to projects`);
        }

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

        // Then load the most recent project
        const project = await ProjectStorage.getMostRecentProject();

        if (project) {
          console.log("Loading most recent project:", project.name);

          // Load the positions
          setPositions(project.positions);

          // Load email configuration if present
          if (project.emailConfig) {
            setEmailConfig(project.emailConfig);
          }

          // Load the certificate image
          if (project.certificateImage.url) {
            setUploadedFileUrl(project.certificateImage.url);
            setUploadedFile(project.certificateImage.filename);
          }

          showToast({
            message: `Loaded project: ${project.name}`,
            type: "info",
            duration: 3000
          });

          // Enable autosave since we loaded saved work
          setHasManuallySaved(true);
          setCurrentProjectName(project.name);
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

  // Project handlers
  const handleLoadProject = useCallback(
    async (project: SavedProject) => {
      // Load the positions
      setPositions(project.positions);

      // Load the table data
      if (project.tableData && project.tableData.length > 0) {
        // Convert tableData array back to TSV format for loading
        const headers = project.columns;
        const rows = project.tableData.map(row => {
          return headers.map(col => row[col] || "").join("\t");
        });
        const tsvData = [headers.join("\t"), ...rows].join("\n");
        
        // Load the data using loadSessionData
        const IS_BINARY = false;
        const HAS_HEADERS = true;
        await loadSessionData(tsvData, IS_BINARY, HAS_HEADERS);
        console.log(`Loaded ${project.tableData.length} rows of data`);
      } else if (project.columns.length > 0) {
        // If no data but has columns, create empty row with those columns
        const headers = project.columns;
        const emptyRow = headers.map(() => "").join("\t");
        const tsvData = [headers.join("\t"), emptyRow].join("\n");
        
        const IS_BINARY = false;
        const HAS_HEADERS = true;
        await loadSessionData(tsvData, IS_BINARY, HAS_HEADERS);
        console.log("Project expects columns:", project.columns);
      }

      // Load email configuration if present
      if (project.emailConfig) {
        setEmailConfig(project.emailConfig);
      }
      
      // Set current project info and enable autosave
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setHasManuallySaved(true);

      // Update the certificate image URL and file
      if (project.certificateImage.url) {
        setUploadedFileUrl(project.certificateImage.url);
        setUploadedFile(project.certificateImage.filename);
      }

      console.log("Project loaded successfully:", project.name);
    },
    [
      setPositions,
      setEmailConfig,
      setUploadedFileUrl,
      setUploadedFile,
      loadSessionData
    ]
  );

  const handleSaveProjectSuccess = useCallback(
    (projectId: string, projectName: string) => {
      console.log("Project saved successfully:", {
        id: projectId,
        name: projectName
      });
      showToast({
        message: `Project "${projectName}" saved successfully`,
        type: "success",
        duration: 3000
      });
      setShowSaveProjectModal(false);
      // Enable autosave after manual save
      setHasManuallySaved(true);
      setCurrentProjectName(projectName);
      setCurrentProjectId(projectId);
    },
    [showToast]
  );

  // Save to current project (no modal)
  const handleSaveToCurrentProject = useCallback(async () => {
    if (!currentProjectName || !uploadedFileUrl || !uploadedFile) return;

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

    const result = await manualSave(currentProjectName, finalUrl, finalFilename);

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
    currentProjectName,
    uploadedFileUrl,
    uploadedFile,
    uploadToServer,
    manualSave,
    showToast
  ]);

  // Handle new project
  const handleNewProject = useCallback(() => {
    // Check if there's any work to save
    const hasWork =
      uploadedFileUrl && (Object.keys(positions).length > 0 || emailConfig);

    if (hasWork) {
      setShowNewProjectModal(true);
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

  const confirmNewProject = useCallback(() => {
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
    setShowNewProjectModal(false);
    setHasManuallySaved(false); // Reset autosave state
    setCurrentProjectName(null); // Reset project name
    setCurrentProjectId(null); // Reset project ID
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
    currentProjectName,
    currentProjectId,
    hasManuallySaved,
    showSaveProjectModal,
    showLoadProjectModal,
    showNewProjectModal,
    setShowSaveProjectModal,
    setShowLoadProjectModal,
    setShowNewProjectModal,
    handleLoadProject,
    handleSaveProjectSuccess,
    handleSaveToCurrentProject,
    handleNewProject,
    confirmNewProject
  };
}