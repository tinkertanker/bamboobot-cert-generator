import { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import type { SavedProject } from "@/lib/project-storage";
import type { EmailConfig, TableData, Positions } from "@/types/certificate";
import type { UseFileUploadReturn } from "@/hooks/useFileUpload";
import { ProjectStorage } from "@/lib/project-storage";
import { SessionStorage } from "@/lib/session-storage";
import { normalizeLegacyPrivateAssetReference } from "@/lib/storage-urls";
import { projectInputError } from '@/utils/input-bounds';
import {
  applyAutomaticTextColor,
  normalizeAutomaticTextColorProvenance
} from "@/utils/imageAnalysis";

interface UseProjectManagementProps {
  // State setters
  setPositions: (positions: Positions) => void;
  setEmailConfig: (config: EmailConfig) => void;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFile: (file: File | string | null) => void;
  
  // Data loading
  loadSessionData: (data: string, isBinary: boolean, hasHeaders: boolean) => Promise<void>;
  
  // File upload
  uploadToServer: UseFileUploadReturn['uploadToServer'];
  
  // Toast notifications
  showToast: (options: { message: string; type: "success" | "error" | "info"; duration: number }) => void;
  
  // Project autosave
  manualSave: (name: string, url?: string, filename?: string) => Promise<{ success: boolean; error?: string }>;
  
  // Current state
  uploadedFileUrl: string | null;
  uploadedFile: File | string | null;
  positions: Positions;
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
  /** Forget the current project if it was deleted (id) or all projects were deleted (null) */
  handleProjectDeleted: (projectId: string | null) => void;
}

/**
 * True when starting a new project would discard something: an uploaded image,
 * placed text fields or table data. (emailConfig is always an object, so it
 * can't signal "work" on its own.)
 */
export function hasProjectWork(
  uploadedFileUrl: string | null,
  positions: Record<string, unknown> | null | undefined,
  tableData: TableData[] | null | undefined
): boolean {
  return (
    !!uploadedFileUrl ||
    Object.keys(positions || {}).length > 0 ||
    (tableData?.length ?? 0) > 0
  );
}

/**
 * Saved projects may carry a stale isConfigured flag; derive it from the fields
 * so the panel's status and the send check agree.
 */
function withComputedIsConfigured(config: EmailConfig): EmailConfig {
  return {
    ...config,
    isConfigured: !!(config.senderName && config.subject && config.message)
  };
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
    const error = projectInputError(project.positions, project.columns, project.tableData || []);
    if (error) throw new Error(error);
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

  const loadProjectTableData = useCallback(async (project: SavedProject) => {
    const error = projectInputError(project.positions, project.columns, project.tableData || []);
    if (error) throw new Error(error);
    if (project.tableData?.length) {
      const headers = project.columns;
      const rows = project.tableData.map(row => headers.map(col => row[col] || "").join("\t"));
      await loadSessionData([headers.join("\t"), ...rows].join("\n"), false, true);
    } else if (project.columns.length > 0) {
      const headers = project.columns;
      await loadSessionData([headers.join("\t"), headers.map(() => "").join("\t")].join("\n"), false, true);
    }
  }, [loadSessionData]);

  // Load most recent project and session data on startup
  useEffect(() => {
    const loadStartupData = async () => {
      try {
        ProjectStorage.migrateFromTemplateStorage();

        // Restore session table data if it is less than 24 hours old
        let restoredWorkingSession = false;
        const session = SessionStorage.loadSession();
        if (session) {
          const sessionAge = SessionStorage.getSessionAge();
          if (sessionAge && sessionAge < 24 * 60 * 60 * 1000) {
            await loadSessionData(
              session.tableInput,
              session.useCSVMode,
              session.isFirstRowHeader
            );
            restoredWorkingSession = true;

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
          // A different browser/origin has no working-session copy. Restore
          // saved rows before enabling autosave, never persist an empty table
          // over the recovered project. Keep the newer local working session.
          if (!restoredWorkingSession) await loadProjectTableData(project);
          loadProjectPositions(project);

          if (project.emailConfig) {
            setEmailConfig(withComputedIsConfigured(project.emailConfig));
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
    loadProjectTableData,
    setUploadedFile,
    setUploadedFileUrl,
    showToast
  ]);

  // Project handlers
  const handleLoadProject = useCallback(
    async (project: SavedProject) => {
      loadProjectPositions(project);
      await loadProjectTableData(project);

      if (project.emailConfig) {
        setEmailConfig(withComputedIsConfigured(project.emailConfig));
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
      loadProjectTableData
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

  // Handle new project
  const handleNewProject = useCallback(() => {
    // Ask for confirmation only when there is something that would be lost.
    if (hasProjectWork(uploadedFileUrl, positions, tableData)) {
      setShowNewProjectModal(true);
    } else {
      // Nothing to lose: reset everything, including the current project
      // reference, so autosave can't overwrite the previous project.
      confirmNewProject();
    }
  }, [uploadedFileUrl, positions, tableData, confirmNewProject]);

  // If the open project is deleted from the Projects modal, stop treating the
  // work as saved: otherwise the header keeps offering "Save to <deleted>" and
  // autosave targets a project that no longer exists.
  const handleProjectDeleted = useCallback(
    (projectId: string | null) => {
      if (projectId === null || projectId === currentProjectId) {
        setCurrentProjectId(null);
        setCurrentProjectName(null);
        setHasManuallySaved(false);
      }
    },
    [currentProjectId]
  );

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
    confirmNewProject,
    handleProjectDeleted
  };
}
