import { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import type { SavedProject } from "@/lib/project-storage";
import type { EmailConfig, TableData } from "@/types/certificate";
import { ProjectStorage } from "@/lib/project-storage";
import { SessionStorage } from "@/lib/session-storage";
import { normalizeLegacyPrivateAssetReference } from "@/lib/storage-urls";
import {
  applyAutomaticTextColor,
  normalizeAutomaticTextColorProvenance
} from "@/utils/imageAnalysis";

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
  automaticTextColorResult: {
    imageUrl: string;
    color: '#ffffff' | '#000000';
  } | null;
  
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
  automaticTextColorResult,
  clearFile,
  clearPositions,
  clearDragState,
  clearData
}: UseProjectManagementProps): UseProjectManagementReturn {
  const { status } = useSession();
  // Ensure the one-shot startup restore reads localStorage only once.
  const hasLoadedStartupRef = useRef(false);
  // Keep latest mutable references for frequently changing objects to avoid
  // recreating callbacks excessively while still reading fresh values.
  const latestPositionsRef = useRef(positions);
  const latestTableDataRef = useRef(tableData);
  const latestEmailConfigRef = useRef(emailConfig);
  const automaticTextColorResultRef = useRef(automaticTextColorResult);

  useEffect(() => {
    latestPositionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    latestTableDataRef.current = tableData;
  }, [tableData]);

  useEffect(() => {
    latestEmailConfigRef.current = emailConfig;
  }, [emailConfig]);

  useEffect(() => {
    automaticTextColorResultRef.current = automaticTextColorResult;
  }, [automaticTextColorResult]);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [hasManuallySaved, setHasManuallySaved] = useState<boolean>(false);
  const [showSaveProjectModal, setShowSaveProjectModal] = useState<boolean>(false);
  const [showLoadProjectModal, setShowLoadProjectModal] = useState<boolean>(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);

  const loadProjectPositions = useCallback((project: SavedProject) => {
    const normalizedPositions = normalizeAutomaticTextColorProvenance(
      project.positions,
      project.columns
    );
    const cachedAutomaticTextColor = automaticTextColorResultRef.current;
    const adjustedPositions =
      cachedAutomaticTextColor?.imageUrl === project.certificateImage.url
        ? applyAutomaticTextColor(
            normalizedPositions,
            project.columns,
            cachedAutomaticTextColor.color
          )
        : normalizedPositions;
    setPositions(adjustedPositions);
    // The normal autosave persists migrated provenance. Avoid a write-on-load
    // that could race with edits or change the project's modified timestamp.
  }, [setPositions]);

  // Load most recent project and session data on startup
  useEffect(() => {
    const loadStartupData = async () => {
      try {
        ProjectStorage.migrateFromTemplateStorage();

        // Restore session table data if it is less than 24 hours old
        const session = SessionStorage.loadSession();
        if (session) {
          const sessionAge = SessionStorage.getSessionAge();
          if (sessionAge && sessionAge < 24 * 60 * 60 * 1000) {
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
            SessionStorage.clearSession();
          }
        }

        const project = await ProjectStorage.getMostRecentProject();

        if (project) {
          loadProjectPositions(project);

          if (project.emailConfig) {
            setEmailConfig(project.emailConfig);
          }

          if (project.certificateImage.url) {
            const asset = normalizeLegacyPrivateAssetReference(
              project.certificateImage.url,
              project.certificateImage.filename,
            );
            setUploadedFileUrl(asset.url);
            setUploadedFile(asset.filename);
          }

          showToast({
            message: `Loaded project: ${project.name}`,
            type: "info",
            duration: 3000
          });

          // Enable autosave; the project ID makes later saves update in place
          setHasManuallySaved(true);
          setCurrentProjectName(project.name);
          setCurrentProjectId(project.id);
        }
      } catch (error) {
        console.error("Error loading startup data:", error);
      }
    };

    // Wait until the authentication status is settled before touching
    // localStorage. On the commit where the session resolves, the account
    // guard in the page component (registered earlier) has already purged any
    // data belonging to a different account, so a newly signed-in user never
    // restores the previous account's session/project. Runs once.
    if (status === "loading") return;
    if (hasLoadedStartupRef.current) return;
    hasLoadedStartupRef.current = true;
    loadStartupData();
  }, [
    status,
    loadSessionData,
    setEmailConfig,
    loadProjectPositions,
    setUploadedFile,
    setUploadedFileUrl,
    showToast
  ]);

  // Project handlers
  const handleLoadProject = useCallback(
    async (project: SavedProject) => {
      loadProjectPositions(project);

      // Rebuild TSV from the saved rows so the table hook can re-parse it
      if (project.tableData && project.tableData.length > 0) {
        const headers = project.columns;
        const rows = project.tableData.map(row => {
          return headers.map(col => row[col] || "").join("\t");
        });
        const tsvData = [headers.join("\t"), ...rows].join("\n");
        await loadSessionData(tsvData, /* csvMode */ false, /* headerRow */ true);
      } else if (project.columns.length > 0) {
        // No rows saved: load the columns with a single empty row
        const headers = project.columns;
        const emptyRow = headers.map(() => "").join("\t");
        const tsvData = [headers.join("\t"), emptyRow].join("\n");
        await loadSessionData(tsvData, /* csvMode */ false, /* headerRow */ true);
      }

      if (project.emailConfig) {
        setEmailConfig(project.emailConfig);
      }
      
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setHasManuallySaved(true);

      if (project.certificateImage.url) {
        const asset = normalizeLegacyPrivateAssetReference(
          project.certificateImage.url,
          project.certificateImage.filename,
        );
        setUploadedFileUrl(asset.url);
        setUploadedFile(asset.filename);
      }
    },
    [
      loadProjectPositions,
      setEmailConfig,
      setUploadedFileUrl,
      setUploadedFile,
      loadSessionData
    ]
  );

  const handleSaveProjectSuccess = useCallback(
    (projectId: string, projectName: string) => {
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
      try {
        const uploadResult = await uploadToServer();
        if (uploadResult) {
          finalUrl = uploadResult.image;
          finalFilename = uploadResult.filename;
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

    // If we have a current project ID, perform an in-place update to avoid creating a new project
    let result: { success: boolean; error?: string };
    if (currentProjectId) {
      const update = await ProjectStorage.updateProject(currentProjectId, {
        positions: latestPositionsRef.current,
        columns: Object.keys(latestTableDataRef.current?.[0] || {}),
        tableData: latestTableDataRef.current,
        emailConfig: latestEmailConfigRef.current,
        certificateImage: {
          url: finalUrl,
          filename: finalFilename,
          uploadedAt: new Date().toISOString(),
          isCloudStorage: false,
          storageProvider: 'local'
        }
      });
      result = { success: update.success, error: update.error };
    } else {
      // Fallback: use manualSave (will create a new project)
      result = await manualSave(currentProjectName, finalUrl, finalFilename);
    }

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
    currentProjectId,
    uploadedFileUrl,
    uploadedFile,
    uploadToServer,
    manualSave,
    showToast
  ]);

  // Handle new project
  const handleNewProject = useCallback(() => {
    // Check if there's any work to save
    const hasWork = uploadedFileUrl && ((Object.keys(positions || {}).length > 0) || emailConfig);

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
