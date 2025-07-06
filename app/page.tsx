"use client";

import { useState, useMemo, ChangeEvent, useCallback, useEffect } from "react";
import Image from "next/image";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import {
  ExternalLink,
  Mail,
  Download,
  FileText,
  Check,
  X,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Edit3,
  Eye,
  EyeOff
} from "lucide-react";

interface TableData {
  [key: string]: string;
}

interface Position {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?:
    | "Helvetica"
    | "Times"
    | "Courier"
    | "Montserrat"
    | "Poppins"
    | "WorkSans"
    | "Roboto"
    | "SourceSansPro"
    | "Nunito"
    | "GreatVibes";
  bold?: boolean;
  italic?: boolean;
  color?: string;
  alignment?: "left" | "center" | "right";
  isVisible?: boolean;
}

interface Positions {
  [key: string]: Position;
}

const DEFAULT_FONT_SIZE = 24;

// Font capabilities configuration
const FONT_CAPABILITIES = {
  Helvetica: { bold: true, italic: true },
  Times: { bold: true, italic: true },
  Courier: { bold: true, italic: true },
  Montserrat: { bold: true, italic: false }, // Has bold but no italic files
  Poppins: { bold: true, italic: true }, // Complete font family - geometric with personality
  WorkSans: { bold: true, italic: true }, // Complete font family - clean with character
  Roboto: { bold: true, italic: true }, // Google's flagship - excellent kerning
  SourceSansPro: { bold: true, italic: true }, // Adobe's masterpiece - professional typography
  Nunito: { bold: true, italic: true }, // Friendly rounded - good spacing
  GreatVibes: { bold: false, italic: false } // Elegant script - single weight only
} as const;

export default function MainPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [tableData, setTableData] = useState<TableData[]>([]);
  const [isFirstRowHeader, setIsFirstRowHeader] = useState<boolean>(false);
  const [useCSVMode, setUseCSVMode] = useState<boolean>(false); // Default to TSV
  const [tableInput, setTableInput] = useState<string>("");
  const [devMode, setDevMode] = useState<boolean>(false);

  // Preset data for dev mode
  const presetCSVData = `Name,Department,Phone
Maximilienne Featherstone-Harrington III,Executive Leadership,+1-555-MAXI-EXEC
Bartholomäus von Quackenbusch-Wetherell,Innovation & Strategy,+1-555-BART-INNO
Anastasiopolis Meridienne Calderón-Rutherford,Global Operations,+1-555-ANAS-GLOB`;
  const [positions, setPositions] = useState<Positions>({});
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "formatting" | "email">(
    "data"
  );
  const [showAppliedMessage, setShowAppliedMessage] = useState<boolean>(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(0);
  const [individualPdfsData, setIndividualPdfsData] = useState<
    { filename: string; url: string; originalIndex: number }[] | null
  >(null);
  const [isGeneratingIndividual, setIsGeneratingIndividual] =
    useState<boolean>(false);
  const [selectedNamingColumn, setSelectedNamingColumn] = useState<string>("");
  const [showResetFieldModal, setShowResetFieldModal] =
    useState<boolean>(false);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [detectedEmailColumn, setDetectedEmailColumn] = useState<string | null>(
    null
  );
  const [emailSendingStatus, setEmailSendingStatus] = useState<{
    [key: number]: "sending" | "sent" | "error";
  }>({});
  const [emailConfig, setEmailConfig] = useState<{
    senderName: string;
    subject: string;
    message: string;
    deliveryMethod: "download" | "attachment";
    isConfigured: boolean;
  }>({
    senderName: "",
    subject: "",
    message: "",
    deliveryMethod: "download",
    isConfigured: false
  });

  // Pointer events state for dragging
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragInfo, setDragInfo] = useState<{
    key: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const [showCenterGuide, setShowCenterGuide] = useState<{
    horizontal: boolean;
    vertical: boolean;
  }>({ horizontal: false, vertical: false });

  // Text measurement utility for consistent sizing
  const measureText = useCallback(
    (
      text: string,
      fontSize: number,
      fontWeight: string = "500",
      fontFamily: string = "system-ui, sans-serif"
    ) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const metrics = ctx.measureText(text);
      return {
        width: metrics.width,
        height: fontSize, // Approximate height - could use actualBoundingBoxAscent + actualBoundingBoxDescent for precision
        actualHeight:
          (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
          (metrics.actualBoundingBoxDescent || fontSize * 0.2)
      };
    },
    []
  );

  // Global pointer event handlers for smooth dragging
  useEffect(() => {
    const handleGlobalPointerMove = (event: PointerEvent) => {
      if (!isDragging || !dragInfo) return;

      const imageContainer = document.querySelector(".image-container");
      if (imageContainer) {
        const containerRect = imageContainer.getBoundingClientRect();

        // Calculate position accounting for initial offset
        const x =
          ((event.clientX - dragInfo.offsetX - containerRect.left) /
            containerRect.width) *
          100;
        const y =
          ((event.clientY - dragInfo.offsetY - containerRect.top) /
            containerRect.height) *
          100;

        // Define the threshold (e.g., 10% from the edge)
        const threshold = 10;

        if (
          x < -threshold ||
          x > 100 + threshold ||
          y < -threshold ||
          y > 100 + threshold
        ) {
          // If dragged too far, reset to center but preserve other properties
          setPositions((prev) => ({
            ...prev,
            [dragInfo.key]: { ...prev[dragInfo.key], x: 50, y: 50 }
          }));
        } else {
          // Clamp the values between 0 and 100 but preserve other properties
          let clampedX = Math.max(0, Math.min(100, x));
          let clampedY = Math.max(0, Math.min(100, y));

          // Center snapping - snap to center if within 2% threshold (closer to the line)
          const snapThreshold = 2;
          const centerX = 50;
          const centerY = 50;

          let isSnappingHorizontal = false;
          let isSnappingVertical = false;

          if (Math.abs(clampedX - centerX) <= snapThreshold) {
            clampedX = centerX;
            isSnappingVertical = true; // Show vertical line when snapping to X center
          }
          if (Math.abs(clampedY - centerY) <= snapThreshold) {
            clampedY = centerY;
            isSnappingHorizontal = true; // Show horizontal line when snapping to Y center
          }

          // Show/hide center guides based on which axis is snapping
          setShowCenterGuide({
            horizontal: isSnappingHorizontal,
            vertical: isSnappingVertical
          });

          setPositions((prev) => ({
            ...prev,
            [dragInfo.key]: { ...prev[dragInfo.key], x: clampedX, y: clampedY }
          }));
        }
      }
    };

    const handleGlobalPointerUp = (event: PointerEvent) => {
      if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId)
        return;

      setIsDragging(false);
      setDragInfo(null);
      setShowCenterGuide({ horizontal: false, vertical: false });
    };

    if (isDragging) {
      document.addEventListener("pointermove", handleGlobalPointerMove);
      document.addEventListener("pointerup", handleGlobalPointerUp);
      document.addEventListener("pointercancel", handleGlobalPointerUp);

      return () => {
        document.removeEventListener("pointermove", handleGlobalPointerMove);
        document.removeEventListener("pointerup", handleGlobalPointerUp);
        document.removeEventListener("pointercancel", handleGlobalPointerUp);
      };
    }
  }, [isDragging, dragInfo]);

  // Cleanup drag state on unmount
  useEffect(() => {
    return () => {
      if (isDragging) {
        setIsDragging(false);
        setDragInfo(null);
      }
    };
  }, [isDragging]);

  // Arrow key nudging for selected field
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedField || isDragging) return;

      const nudgeAmount = event.shiftKey ? 2 : 0.5; // Larger nudge with Shift

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              y: Math.max(0, (prev[selectedField]?.y || 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowDown":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              y: Math.min(100, (prev[selectedField]?.y || 50) + nudgeAmount)
            }
          }));
          break;
        case "ArrowLeft":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.max(0, (prev[selectedField]?.x || 50) - nudgeAmount)
            }
          }));
          break;
        case "ArrowRight":
          event.preventDefault();
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              x: Math.min(100, (prev[selectedField]?.x || 50) + nudgeAmount)
            }
          }));
          break;
      }
    };

    if (selectedField) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [selectedField, isDragging]);

  // ESC key to dismiss all modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Close all modals
        setGeneratedPdfUrl(null);
        setIndividualPdfsData(null);
        setShowResetFieldModal(false);
        setShowClearAllModal(false);
      }
    };

    document.addEventListener("keydown", handleEscKey);
    return () => document.removeEventListener("keydown", handleEscKey);
  }, []);

  // Bold/Italic keyboard shortcuts (Ctrl/Cmd+B for bold, Ctrl/Cmd+I for italic)
  useEffect(() => {
    const handleFormatShortcuts = (event: KeyboardEvent) => {
      if (!selectedField) return;

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const isCommandPressed = isMac ? event.metaKey : event.ctrlKey;

      if (!isCommandPressed) return;

      const currentFont = positions[selectedField]?.fontFamily || "Helvetica";
      const fontCapabilities = FONT_CAPABILITIES[currentFont];

      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        if (fontCapabilities.bold) {
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              bold: !prev[selectedField]?.bold
            }
          }));
        }
      } else if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        if (fontCapabilities.italic) {
          setPositions((prev) => ({
            ...prev,
            [selectedField]: {
              ...prev[selectedField],
              italic: !prev[selectedField]?.italic
            }
          }));
        }
      }
    };

    if (selectedField) {
      document.addEventListener("keydown", handleFormatShortcuts);
      return () =>
        document.removeEventListener("keydown", handleFormatShortcuts);
    }
  }, [selectedField, positions]);

  // Ensure all table columns have positions and reset preview index
  useEffect(() => {
    if (tableData.length > 0) {
      // Reset preview index when table data changes
      setCurrentPreviewIndex(0);

      setPositions((prevPositions) => {
        const newPositions = { ...prevPositions };
        let hasNewPositions = false;

        Object.keys(tableData[0]).forEach((key, index) => {
          if (!newPositions[key]) {
            // Check if this is an email field
            const isEmailField =
              key.toLowerCase().includes("email") ||
              key.toLowerCase().includes("e-mail") ||
              key.toLowerCase().includes("mail");

            newPositions[key] = {
              x: 50,
              y: 50 + index * 10,
              fontSize: DEFAULT_FONT_SIZE,
              fontFamily: "Helvetica",
              color: "#000000",
              alignment: "center",
              isVisible: !isEmailField // Hide email fields by default
            };
            hasNewPositions = true;
          }
        });

        return hasNewPositions ? newPositions : prevPositions;
      });
    }
  }, [tableData]);

  const processFile = async (file: File) => {
    if (file && (file.type === "image/jpeg" || file.type === "image/png")) {
      setUploadedFile(file);
      setIsLoading(true);
      const formData = new FormData();
      formData.append("template", file);
      console.log("Uploading file to API...");
      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        const data = await response.json();
        console.log(data.message);
        setUploadedFile(data.filename);
        setUploadedFileUrl(data.image);
      } catch (error) {
        console.error("Error uploading file:", error);
      } finally {
        setIsLoading(false);
      }
    } else {
      alert("Please upload a JPEG or PNG file.");
    }
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleFileDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  // Helper function to parse CSV with proper quote handling
  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  // Detect email column from headers and data
  const detectEmailColumn = (headers: string[], data: TableData[]) => {
    // First try to detect by header name
    const emailHeaderPatterns =
      /^(email|e-mail|mail|email address|e-mail address|correo|courriel)$/i;
    let emailColumn = headers.find((header) =>
      emailHeaderPatterns.test(header.trim())
    );

    // If not found by header, try to detect by content
    if (!emailColumn && data.length > 0) {
      const emailContentPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const header of headers) {
        // Check if at least 50% of non-empty values in this column look like emails
        const columnValues = data
          .map((row) => row[header])
          .filter((val) => val && val.trim() !== "");

        if (columnValues.length > 0) {
          const emailCount = columnValues.filter((val) =>
            emailContentPattern.test(val.trim())
          ).length;

          if (emailCount / columnValues.length >= 0.5) {
            emailColumn = header;
            break;
          }
        }
      }
    }

    setDetectedEmailColumn(emailColumn || null);

    // Reset email config when data changes (session-based)
    setEmailConfig({
      senderName: "",
      subject: "",
      message: "",
      deliveryMethod: "download",
      isConfigured: false
    });

    // Switch away from email tab if no email column detected
    if (!emailColumn && activeTab === "email") {
      setActiveTab("data");
    }
  };

  const processTableData = (
    input: string,
    useHeaderRow: boolean = isFirstRowHeader,
    csvMode: boolean = useCSVMode
  ) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    const lines = trimmedInput.split("\n");
    if (lines.length === 0) return;

    // Use the format selected by the user toggle
    const delimiter = csvMode ? "," : "\t";
    console.log(`Using ${csvMode ? "CSV" : "TSV"} mode`);

    const rows = lines.map((row) => {
      if (csvMode) {
        return parseCSVRow(row);
      } else {
        return row.split(delimiter);
      }
    });
    if (rows.length === 0) return;

    const headers = useHeaderRow
      ? rows[0].map((header, index) => header || `_column_${index}`) // Handle blank headers
      : rows[0].map((_, index) => `Column ${index + 1}`);
    const data = useHeaderRow ? rows.slice(1) : rows;
    const tableData = data.map((row) => {
      const obj: TableData = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || "";
      });
      return obj;
    });
    setTableData(tableData);

    // Auto-detect email column
    detectEmailColumn(headers, tableData);
  };

  // Send individual certificate via email
  const sendCertificateEmail = async (
    index: number,
    file: { filename: string; url: string; originalIndex: number }
  ) => {
    if (
      !detectedEmailColumn ||
      !individualPdfsData ||
      !emailConfig.isConfigured
    )
      return;

    const recipientData = tableData[file.originalIndex || index];
    const recipientEmail = recipientData[detectedEmailColumn];

    if (!recipientEmail) {
      alert("No email address found for this recipient");
      return;
    }

    // Update sending status
    setEmailSendingStatus((prev) => ({ ...prev, [index]: "sending" }));

    try {
      // Get recipient name (try common name columns)
      const nameColumns = [
        "Name",
        "name",
        "Full Name",
        "full_name",
        "fullname"
      ];
      const recipientName =
        nameColumns
          .map((col) => recipientData[col])
          .find((val) => val && val.trim() !== "") || "Certificate Recipient";

      // Replace [Recipient Name] placeholder in message
      const personalizedMessage = emailConfig.message.replace(
        /\[Recipient Name\]/g,
        recipientName
      );

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: emailConfig.subject,
          recipientName: recipientName,
          senderName: emailConfig.senderName,
          customMessage: personalizedMessage,
          deliveryMethod: emailConfig.deliveryMethod,
          attachmentUrl:
            emailConfig.deliveryMethod === "attachment" ? file.url : null,
          downloadUrl:
            emailConfig.deliveryMethod === "download" ? file.url : null,
          attachmentName: file.filename
        })
      });

      const result = await response.json();

      if (response.ok) {
        setEmailSendingStatus((prev) => ({ ...prev, [index]: "sent" }));

        // Mark as emailed in R2 if using cloud storage
        if (
          file.url.includes("r2.cloudflarestorage.com") ||
          (process.env.R2_PUBLIC_URL &&
            file.url.startsWith(process.env.R2_PUBLIC_URL))
        ) {
          try {
            await fetch("/api/mark-emailed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileUrl: file.url })
            });
          } catch (error) {
            console.warn("Failed to mark file as emailed:", error);
          }
        }
      } else {
        throw new Error(result.error || "Failed to send email");
      }
    } catch (error) {
      console.error("Email sending failed:", error);
      setEmailSendingStatus((prev) => ({ ...prev, [index]: "error" }));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to send email: ${errorMessage}`);
    }
  };

  const handleTableDataChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newInput = event.target.value;
    setTableInput(newInput);
    if (newInput.trim() === "") {
      setTableData([]);
    } else {
      processTableData(newInput, isFirstRowHeader);
    }
  };

  const handleHeaderToggle = () => {
    setIsFirstRowHeader((prev) => {
      const newValue = !prev;
      processTableData(tableInput, newValue);
      return newValue;
    });
  };

  const handleCSVModeToggle = () => {
    setUseCSVMode((prev) => {
      const newValue = !prev;
      // Reprocess data with new format
      if (tableInput.trim()) {
        processTableData(tableInput, isFirstRowHeader, newValue);
      }
      return newValue;
    });
  };

  const handleDevModeToggle = () => {
    setDevMode((prev) => {
      const newValue = !prev;
      if (newValue) {
        // Enable dev mode: load preset data and template
        setUseCSVMode(true);
        setIsFirstRowHeader(true);
        setTableInput(presetCSVData);
        processTableData(presetCSVData, true, true);

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
        setTableInput("");
        setTableData([]);
        setUploadedFile(null);
        setUploadedFileUrl(null);
        setPositions({});
        setPdfDownloadUrl(null);
        setGeneratedPdfUrl(null);
        console.log("Dev mode disabled: data cleared");
      }
      return newValue;
    });
  };

  // Navigation functions
  const goToFirst = () => setCurrentPreviewIndex(0);
  const goToPrevious = () =>
    setCurrentPreviewIndex((prev) => Math.max(0, prev - 1));
  const goToNext = () =>
    setCurrentPreviewIndex((prev) => Math.min(tableData.length - 1, prev + 1));
  const goToLast = () => setCurrentPreviewIndex(tableData.length - 1);

  // Helper function to change alignment while keeping visual position
  const changeAlignment = useCallback(
    (key: string, newAlignment: "left" | "center" | "right") => {
      setPositions((prev) => {
        const currentPos = prev[key];
        if (!currentPos) return prev;

        const currentAlignment = currentPos.alignment || "left";
        if (currentAlignment === newAlignment) return prev;

        // Get the text element to measure actual width
        const textElement = document.querySelector(
          `[data-key="${key}"]`
        ) as HTMLElement;
        if (!textElement) {
          // Fallback: just change alignment without position adjustment
          return {
            ...prev,
            [key]: { ...currentPos, alignment: newAlignment }
          };
        }

        const containerElement = document.querySelector(
          ".image-container img"
        ) as HTMLImageElement;
        if (!containerElement) {
          return {
            ...prev,
            [key]: { ...currentPos, alignment: newAlignment }
          };
        }

        // Get actual text width in pixels
        const textRect = textElement.getBoundingClientRect();
        const containerRect = containerElement.getBoundingClientRect();
        const textWidthPercent = (textRect.width / containerRect.width) * 100;

        let xAdjustment = 0;

        // Calculate position adjustment to keep text visually in same place
        if (currentAlignment === "left" && newAlignment === "center") {
          xAdjustment = textWidthPercent / 2;
        } else if (currentAlignment === "left" && newAlignment === "right") {
          xAdjustment = textWidthPercent;
        } else if (currentAlignment === "center" && newAlignment === "left") {
          xAdjustment = -textWidthPercent / 2;
        } else if (currentAlignment === "center" && newAlignment === "right") {
          xAdjustment = textWidthPercent / 2;
        } else if (currentAlignment === "right" && newAlignment === "left") {
          xAdjustment = -textWidthPercent;
        } else if (currentAlignment === "right" && newAlignment === "center") {
          xAdjustment = -textWidthPercent / 2;
        }

        const newX = Math.max(0, Math.min(100, currentPos.x + xAdjustment));

        return {
          ...prev,
          [key]: {
            ...currentPos,
            alignment: newAlignment,
            x: newX
          }
        };
      });
    },
    []
  );

  // Helper function to convert hex color to RGB array
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
        ]
      : [0, 0, 0]; // Default to black if parsing fails
  };

  const generatePdf = async () => {
    setIsGenerating(true);
    try {
      // Measure actual container dimensions
      const containerElement = document.querySelector(
        ".image-container img"
      ) as HTMLImageElement;
      const containerDimensions = containerElement
        ? {
            width: containerElement.offsetWidth,
            height: containerElement.offsetHeight
          }
        : { width: 600, height: 400 }; // Fallback dimensions

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          templateFilename: uploadedFile?.name,
          uiContainerDimensions: containerDimensions,
          data: tableData.map((row) => {
            const entry: {
              [key: string]: {
                text: string;
                color?: [number, number, number];
                uiMeasurements?: {
                  width: number;
                  height: number;
                  actualHeight: number;
                };
              };
            } = {};
            Object.keys(row).forEach((key) => {
              // Skip hidden fields
              if (positions[key]?.isVisible === false) {
                return;
              }

              const fontSize = DEFAULT_FONT_SIZE;
              const measurements = measureText(row[key], fontSize, "500");
              const position = positions[key];
              entry[key] = {
                text: row[key],
                color: position?.color
                  ? hexToRgb(position.color)
                  : hexToRgb("#000000"),
                uiMeasurements: measurements
              };
            });
            return entry;
          }),
          positions: Object.fromEntries(
            Object.entries(positions)
              .filter(([, pos]) => pos.isVisible !== false) // Filter out hidden fields
              .map(([key, pos]) => [
                key,
                {
                  x: pos.x / 100,
                  y: pos.y / 100,
                  fontSize: pos.fontSize || DEFAULT_FONT_SIZE,
                  font: pos.fontFamily || "Helvetica",
                  bold: pos.bold || false,
                  oblique: pos.italic || false,
                  alignment: pos.alignment || "left"
                }
              ])
          )
        })
      });
      const data = await response.json();
      setGeneratedPdfUrl(data.outputPath);
      setPdfDownloadUrl(data.outputPath);
      setIsGenerating(false);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setIsGenerating(false);
    }
  };

  // Function to detect if any column contains email addresses
  const hasEmailColumn = useMemo(() => {
    if (tableData.length === 0) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Check each column for email patterns
    const columns = Object.keys(tableData[0]);
    return columns.some((column) => {
      // Check if at least 50% of non-empty values in this column are emails
      const values = tableData
        .map((row) => row[column])
        .filter((val) => val && val.trim());
      if (values.length === 0) return false;

      const emailCount = values.filter((val) =>
        emailRegex.test(val.trim())
      ).length;
      return emailCount / values.length >= 0.5;
    });
  }, [tableData]);

  const generateIndividualPdfs = async () => {
    setIsGeneratingIndividual(true);
    try {
      // Measure actual container dimensions
      const containerElement = document.querySelector(
        ".image-container img"
      ) as HTMLImageElement;
      const containerDimensions = containerElement
        ? {
            width: containerElement.offsetWidth,
            height: containerElement.offsetHeight
          }
        : { width: 600, height: 400 }; // Fallback dimensions

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "individual",
          templateFilename: uploadedFile?.name,
          uiContainerDimensions: containerDimensions,
          namingColumn: selectedNamingColumn,
          data: tableData.map((row) => {
            const entry: {
              [key: string]: {
                text: string;
                color?: [number, number, number];
                uiMeasurements?: {
                  width: number;
                  height: number;
                  actualHeight: number;
                };
              };
            } = {};
            Object.keys(row).forEach((key) => {
              // Skip hidden fields
              if (positions[key]?.isVisible === false) {
                return;
              }

              const fontSize = DEFAULT_FONT_SIZE;
              const measurements = measureText(row[key], fontSize, "500");
              const position = positions[key];
              entry[key] = {
                text: row[key],
                color: position?.color
                  ? hexToRgb(position.color)
                  : hexToRgb("#000000"),
                uiMeasurements: measurements
              };
            });
            return entry;
          }),
          positions: Object.fromEntries(
            Object.entries(positions)
              .filter(([, pos]) => pos.isVisible !== false) // Filter out hidden fields
              .map(([key, pos]) => [
                key,
                {
                  x: pos.x / 100,
                  y: pos.y / 100,
                  fontSize: pos.fontSize || DEFAULT_FONT_SIZE,
                  font: pos.fontFamily || "Helvetica",
                  bold: pos.bold || false,
                  oblique: pos.italic || false,
                  alignment: pos.alignment || "left"
                }
              ])
          )
        })
      });
      const data = await response.json();

      // Set initial naming column to first column
      if (tableData.length > 0 && !selectedNamingColumn) {
        setSelectedNamingColumn(Object.keys(tableData[0])[0]);
      }

      setIndividualPdfsData(data.files);
      setIsGeneratingIndividual(false);
    } catch (error) {
      console.error("Error generating individual PDFs:", error);
      setIsGeneratingIndividual(false);
    }
  };

  const handleDownloadPdf = () => {
    if (pdfDownloadUrl) {
      // Use force-download API to ensure proper download
      const downloadUrl = `/api/force-download?url=${encodeURIComponent(pdfDownloadUrl)}&filename=generated_certificates.pdf`;
      window.location.href = downloadUrl;
    }
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

  // Pointer event handlers for precise dragging
  const handlePointerDown = useCallback(
    (event: React.PointerEvent, key: string) => {
      event.preventDefault();

      // Select the field for formatting and switch to formatting tab
      setSelectedField(key);
      setActiveTab("formatting");
      setShowCenterGuide({ horizontal: false, vertical: false });

      const element = event.currentTarget as HTMLElement;
      const rect = element.getBoundingClientRect();

      // Get current alignment to calculate correct anchor point
      const currentAlignment = positions[key]?.alignment || "left";

      // Calculate anchor point based on alignment
      let anchorX: number;
      if (currentAlignment === "center") {
        anchorX = rect.left + rect.width / 2;
      } else if (currentAlignment === "right") {
        anchorX = rect.right;
      } else {
        // left alignment
        anchorX = rect.left;
      }

      // Calculate offset from the alignment anchor point
      const offsetX = event.clientX - anchorX;
      const offsetY = event.clientY - (rect.top + rect.height / 2);

      setDragInfo({
        key,
        offsetX,
        offsetY,
        pointerId: event.pointerId
      });
      setIsDragging(true);

      // Capture pointer for smooth dragging
      element.setPointerCapture(event.pointerId);
    },
    [positions]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId)
        return;

      event.preventDefault();

      setIsDragging(false);
      setDragInfo(null);

      // Release pointer capture
      const element = event.currentTarget as HTMLElement;
      element.releasePointerCapture(event.pointerId);
    },
    [isDragging, dragInfo]
  );

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
            <Button
              onClick={generatePdf}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                tableData.length === 0
              }
              className="text-white font-semibold px-6"
              style={{
                background:
                  !uploadedFile ||
                  isGenerating ||
                  isGeneratingIndividual ||
                  tableData.length === 0
                    ? "linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)"
                    : "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)",
                borderColor: "#E76F51",
                boxShadow:
                  !uploadedFile ||
                  isGenerating ||
                  isGeneratingIndividual ||
                  tableData.length === 0
                    ? "0 2px 4px rgba(107, 114, 128, 0.2)"
                    : "0 2px 4px rgba(231, 111, 81, 0.2)"
              }}
              onMouseOver={(e) => {
                if (
                  !(
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    tableData.length === 0
                  )
                ) {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #D65A3A 0%, #E76F51 100%)";
                }
              }}
              onMouseOut={(e) => {
                if (
                  !(
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    tableData.length === 0
                  )
                ) {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)";
                }
              }}>
              {isGenerating ? "Generating..." : "Generate PDF"}
            </Button>
            <Button
              onClick={generateIndividualPdfs}
              disabled={
                !uploadedFile ||
                isGenerating ||
                isGeneratingIndividual ||
                tableData.length === 0
              }
              className="text-white font-semibold px-6"
              style={{
                background:
                  !uploadedFile ||
                  isGenerating ||
                  isGeneratingIndividual ||
                  tableData.length === 0
                    ? "linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)"
                    : "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)",
                borderColor: "#E76F51",
                boxShadow:
                  !uploadedFile ||
                  isGenerating ||
                  isGeneratingIndividual ||
                  tableData.length === 0
                    ? "0 2px 4px rgba(107, 114, 128, 0.2)"
                    : "0 2px 4px rgba(231, 111, 81, 0.2)"
              }}
              onMouseOver={(e) => {
                if (
                  !(
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    tableData.length === 0
                  )
                ) {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #D65A3A 0%, #E76F51 100%)";
                }
              }}
              onMouseOut={(e) => {
                if (
                  !(
                    !uploadedFile ||
                    isGenerating ||
                    isGeneratingIndividual ||
                    tableData.length === 0
                  )
                ) {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)";
                }
              }}>
              {isGeneratingIndividual
                ? "Generating..."
                : "Generate Individual PDFs"}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 grid grid-cols-[60%_40%] gap-6 p-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <div className="relative w-full image-container">
            {" "}
            {/* Add image-container class */}
            {isLoading && <Spinner />} {/* Show spinner while loading */}
            {uploadedFileUrl ? (
              <>
                <div className="border-4 border-gray-700 inline-block relative w-full">
                  <img
                    src={uploadedFileUrl}
                    alt="Certificate Template"
                    className="w-full h-auto block"
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
                          positions[key]?.fontFamily || "Helvetica";
                        const isBold = positions[key]?.bold || false;
                        const isItalic = positions[key]?.italic || false;
                        const textColor = positions[key]?.color || "#000000";
                        const alignment = positions[key]?.alignment || "center";

                        // Map font names to CSS font families
                        const fontFamilyMap = {
                          Helvetica:
                            '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                          Times: 'Times, "Times New Roman", Georgia, serif',
                          Courier: 'Courier, "Courier New", monospace',
                          Montserrat:
                            'var(--font-montserrat), "Montserrat", sans-serif',
                          Poppins: 'var(--font-poppins), "Poppins", sans-serif',
                          WorkSans:
                            'var(--font-work-sans), "Work Sans", sans-serif',
                          Roboto: 'var(--font-roboto), "Roboto", sans-serif',
                          SourceSansPro:
                            'var(--font-source-sans-pro), "Source Sans Pro", sans-serif',
                          Nunito: 'var(--font-nunito), "Nunito", sans-serif',
                          GreatVibes:
                            'var(--font-great-vibes), "Great Vibes", cursive'
                        };

                        // Calculate transform based on alignment
                        const transformX =
                          alignment === "center"
                            ? "-50%"
                            : alignment === "right"
                              ? "-100%"
                              : "0%";

                        const style = {
                          left: `${positions[key]?.x ?? 50}%`,
                          top: `${positions[key]?.y ?? 50 + index * 10}%`,
                          transform: `translate(${transformX}, -50%)`,
                          fontSize: `${fontSize}px`,
                          fontFamily: fontFamilyMap[fontFamily],
                          fontWeight: isBold ? "bold" : "normal",
                          fontStyle: isItalic ? "italic" : "normal",
                          color: textColor,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                          position: "absolute" as const,
                          pointerEvents: "auto" as const,
                          userSelect: "none" as const,
                          touchAction: "none",
                          opacity: isHidden ? 0.3 : 1, // Ghost effect for hidden fields
                          backgroundColor: isCurrentlyDragging
                            ? "rgba(231, 111, 81, 0.15)"
                            : isSelected
                              ? "rgba(45, 106, 79, 0.15)"
                              : isHidden
                                ? "rgba(128, 128, 128, 0.1)" // Subtle grey background for hidden fields
                                : "transparent",
                          border: isCurrentlyDragging
                            ? "2px solid #E76F51"
                            : isSelected
                              ? "2px solid #2D6A4F"
                              : isHidden
                                ? "2px dashed #999" // Dashed border for hidden fields
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
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        left: "-2px",
                                        top: "-2px",
                                        width: "8px",
                                        height: "4px",
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        left: "-2px",
                                        bottom: "-2px",
                                        width: "4px",
                                        height: "8px",
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        left: "-2px",
                                        bottom: "-2px",
                                        width: "8px",
                                        height: "4px",
                                        backgroundColor: "#E76F51"
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
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        left: "calc(50% - 6px)",
                                        bottom: "-2px",
                                        width: "12px",
                                        height: "4px",
                                        backgroundColor: "#E76F51"
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
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        right: "-2px",
                                        top: "-2px",
                                        width: "8px",
                                        height: "4px",
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        right: "-2px",
                                        bottom: "-2px",
                                        width: "4px",
                                        height: "8px",
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                    <div
                                      className="absolute pointer-events-none"
                                      style={{
                                        right: "-2px",
                                        bottom: "-2px",
                                        width: "8px",
                                        height: "4px",
                                        backgroundColor: "#E76F51"
                                      }}
                                    />
                                  </>
                                )}
                              </>
                            )}
                            {value}
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
                          borderColor: "#E76F51",
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
                          borderColor: "#E76F51",
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
                  borderColor: isDraggingFile ? "#2D6A4F" : "#D1D5DB",
                  backgroundColor: isDraggingFile
                    ? "rgba(45, 106, 79, 0.1)"
                    : "#F9FAFB"
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleFileDrop}>
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
                        : "Choose File or Drag & Drop (JPEG or PNG)"}
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

          {/* Toolbar */}
          {uploadedFileUrl && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setUploadedFileUrl(null);
                      setUploadedFile(null);
                      setPositions({});
                      setIsDragging(false);
                      setDragInfo(null);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
                      borderColor: "#1B4332",
                      boxShadow: "0 1px 3px rgba(27, 67, 50, 0.2)",
                      color: "#FFFFFF"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background =
                        "linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background =
                        "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)";
                    }}>
                    Clear Template
                  </Button>
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
              {selectedField && (
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs ${
                    activeTab === "formatting"
                      ? "text-amber-600"
                      : "text-green-800"
                  }`}
                  style={{
                    backgroundColor:
                      activeTab === "formatting" ? "#F4A261" : "#D1FAE5",
                    borderRadius: "4px"
                  }}>
                  {selectedField}
                </span>
              )}
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
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-6 mb-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="header-toggle"
                    checked={isFirstRowHeader}
                    onChange={handleHeaderToggle}
                    className="mr-2"
                  />
                  <label htmlFor="header-toggle" className="text-sm">
                    Treat first row as header
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="csv-mode-toggle"
                    checked={useCSVMode}
                    onChange={handleCSVModeToggle}
                    className="mr-2"
                  />
                  <label htmlFor="csv-mode-toggle" className="text-sm">
                    CSV mode (comma-separated)
                  </label>
                </div>
              </div>
              <div className="flex flex-col h-[480px]">
                <Textarea
                  value={tableInput}
                  onChange={handleTableDataChange}
                  placeholder={
                    useCSVMode
                      ? "Paste CSV data here (e.g., John Doe,Manager,Sales)"
                      : "Paste TSV data here (tab-separated)"
                  }
                  className="w-full resize-none"
                  style={{ height: "154px" }}
                />
                {tableData.length > 0 && (
                  <div className="mt-4 flex-1 min-h-0">
                    <div className="h-full overflow-y-auto border border-gray-200 rounded-lg">
                      <table
                        {...getTableProps()}
                        className="min-w-full bg-white">
                        <thead
                          className="sticky top-0"
                          style={{ backgroundColor: "#cccccc" }}>
                          {headerGroups.map(
                            (headerGroup: HeaderGroup<TableData>, index) => (
                              <tr key={headerGroup.id || `header-${index}`}>
                                {headerGroup.headers.map(
                                  (column: ColumnInstance<TableData>) => (
                                    <th
                                      className="px-4 py-2 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                                      key={column.id}>
                                      <div className="flex items-center gap-2">
                                        {column.render("Header")}
                                        {detectedEmailColumn === column.id && (
                                          <div title="Email column detected">
                                            <Mail className="h-3 w-3 text-blue-600" />
                                          </div>
                                        )}
                                      </div>
                                    </th>
                                  )
                                )}
                              </tr>
                            )
                          )}
                        </thead>
                        <tbody {...getTableBodyProps()}>
                          {rows.map((row: Row<TableData>, index) => {
                            prepareRow(row);
                            const isCurrentRow = index === currentPreviewIndex;
                            return (
                              <tr
                                key={row.id || index}
                                className={`${
                                  isCurrentRow ? "" : "hover:bg-gray-50"
                                } transition-colors cursor-pointer`}
                                style={{
                                  backgroundColor: isCurrentRow
                                    ? "#FFFBEB"
                                    : "transparent",
                                  borderColor: isCurrentRow
                                    ? "#FDE68A"
                                    : "transparent"
                                }}
                                onClick={() => setCurrentPreviewIndex(index)}
                                title={
                                  isCurrentRow
                                    ? "Currently viewing this entry"
                                    : "Click to view this entry"
                                }>
                                {row.cells.map((cell: Cell<TableData>) => (
                                  <td
                                    className={`px-4 py-2 border-b border-gray-200 text-sm ${
                                      isCurrentRow
                                        ? "text-amber-900 font-medium"
                                        : "text-gray-900"
                                    }`}
                                    key={cell.column.id}>
                                    {cell.render("Cell")}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "formatting" && (
            <div>
              {selectedField ? (
                <div className="space-y-6">
                  <div
                    className="flex items-center justify-between p-3 rounded-lg relative"
                    style={{
                      backgroundColor: "#FFFEF7",
                      border: "1px solid #dddddd"
                    }}>
                    <h3 className="text-sm">
                      <span className="text-gray-500 font-normal">Field:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {selectedField}
                      </span>
                    </h3>
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
                  </div>

                  {/* Size, Style, Formatting Row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Size
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="8"
                          max="72"
                          value={
                            positions[selectedField]?.fontSize ||
                            DEFAULT_FONT_SIZE
                          }
                          onChange={(e) => {
                            const newFontSize =
                              parseInt(e.target.value) || DEFAULT_FONT_SIZE;
                            setPositions((prev) => ({
                              ...prev,
                              [selectedField]: {
                                ...prev[selectedField],
                                fontSize: newFontSize
                              }
                            }));
                          }}
                          className="w-16 h-10 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <span className="text-sm text-gray-500">px</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Style
                      </label>
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const currentFont =
                            positions[selectedField]?.fontFamily || "Helvetica";
                          const fontCapabilities =
                            FONT_CAPABILITIES[currentFont];
                          const boldDisabled = !fontCapabilities.bold;
                          const italicDisabled = !fontCapabilities.italic;

                          return (
                            <>
                              <Button
                                variant={
                                  positions[selectedField]?.bold
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                disabled={boldDisabled}
                                onClick={() => {
                                  if (!boldDisabled) {
                                    setPositions((prev) => ({
                                      ...prev,
                                      [selectedField]: {
                                        ...prev[selectedField],
                                        bold: !prev[selectedField]?.bold
                                      }
                                    }));
                                  }
                                }}
                                className="h-10 w-10"
                                style={{
                                  backgroundColor: boldDisabled
                                    ? "#e5e7eb"
                                    : positions[selectedField]?.bold
                                      ? "#2D6A4F"
                                      : "transparent",
                                  borderColor: boldDisabled
                                    ? "#d1d5db"
                                    : "#2D6A4F",
                                  color: boldDisabled
                                    ? "#9ca3af"
                                    : positions[selectedField]?.bold
                                      ? "white"
                                      : "#2D6A4F",
                                  cursor: boldDisabled
                                    ? "not-allowed"
                                    : "pointer"
                                }}
                                title={
                                  boldDisabled
                                    ? `Bold not supported for ${currentFont}`
                                    : "Toggle bold"
                                }>
                                <strong>B</strong>
                              </Button>
                              <Button
                                variant={
                                  positions[selectedField]?.italic
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                disabled={italicDisabled}
                                onClick={() => {
                                  if (!italicDisabled) {
                                    setPositions((prev) => ({
                                      ...prev,
                                      [selectedField]: {
                                        ...prev[selectedField],
                                        italic: !prev[selectedField]?.italic
                                      }
                                    }));
                                  }
                                }}
                                className="h-10 w-10"
                                style={{
                                  backgroundColor: italicDisabled
                                    ? "#e5e7eb"
                                    : positions[selectedField]?.italic
                                      ? "#2D6A4F"
                                      : "transparent",
                                  borderColor: italicDisabled
                                    ? "#d1d5db"
                                    : "#2D6A4F",
                                  color: italicDisabled
                                    ? "#9ca3af"
                                    : positions[selectedField]?.italic
                                      ? "white"
                                      : "#2D6A4F",
                                  cursor: italicDisabled
                                    ? "not-allowed"
                                    : "pointer"
                                }}
                                title={
                                  italicDisabled
                                    ? `Italic not supported for ${currentFont}`
                                    : "Toggle italic"
                                }>
                                <em>I</em>
                              </Button>
                              <Button
                                variant={
                                  positions[selectedField]?.isVisible === false
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                onClick={() => {
                                  setPositions((prev) => ({
                                    ...prev,
                                    [selectedField]: {
                                      ...prev[selectedField],
                                      isVisible:
                                        prev[selectedField]?.isVisible === false
                                          ? true
                                          : false
                                    }
                                  }));
                                }}
                                className="h-10 w-10"
                                style={{
                                  backgroundColor:
                                    positions[selectedField]?.isVisible ===
                                    false
                                      ? "#2D6A4F"
                                      : "transparent",
                                  borderColor: "#2D6A4F",
                                  color:
                                    positions[selectedField]?.isVisible ===
                                    false
                                      ? "white"
                                      : "#2D6A4F"
                                }}
                                title={
                                  positions[selectedField]?.isVisible !== false
                                    ? "Hide field"
                                    : "Show field"
                                }>
                                {positions[selectedField]?.isVisible !==
                                false ? (
                                  <Eye className="h-4 w-4" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Font
                      </label>
                      <Select
                        value={
                          positions[selectedField]?.fontFamily || "Helvetica"
                        }
                        onChange={(e) => {
                          const newFontFamily = e.target.value as
                            | "Helvetica"
                            | "Times"
                            | "Courier"
                            | "Montserrat"
                            | "Poppins"
                            | "WorkSans"
                            | "Roboto"
                            | "SourceSansPro"
                            | "Nunito"
                            | "GreatVibes";
                          const newFontCapabilities =
                            FONT_CAPABILITIES[newFontFamily];

                          setPositions((prev) => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              fontFamily: newFontFamily,
                              // Clear bold/italic if the new font doesn't support them
                              ...(!newFontCapabilities.bold
                                ? { bold: false }
                                : {}),
                              ...(!newFontCapabilities.italic
                                ? { italic: false }
                                : {})
                            }
                          }));
                        }}
                        className="text-xs">
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times">Times</option>
                        <option value="Courier">Courier</option>
                        <option value="Montserrat">Montserrat</option>
                        <option value="Poppins">Poppins</option>
                        <option value="WorkSans">Work Sans</option>
                        <option value="Roboto">Roboto</option>
                        <option value="SourceSansPro">Source Sans Pro</option>
                        <option value="Nunito">Nunito</option>
                        <option value="GreatVibes">Great Vibes</option>
                      </Select>
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div>
                    <input
                      type="range"
                      min="8"
                      max="72"
                      value={positions[selectedField]?.fontSize || 24}
                      onChange={(e) => {
                        const newFontSize = parseInt(e.target.value);
                        setPositions((prev) => ({
                          ...prev,
                          [selectedField]: {
                            ...prev[selectedField],
                            fontSize: newFontSize
                          }
                        }));
                      }}
                      className="w-full"
                    />
                  </div>

                  {/* Text Color Picker */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-3 block">
                      Text Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={positions[selectedField]?.color || "#000000"}
                        onChange={(e) => {
                          setPositions((prev) => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              color: e.target.value
                            }
                          }));
                        }}
                        className="w-10 h-8 rounded border border-gray-300 cursor-pointer"
                      />
                      <span className="text-xs text-gray-500 font-mono">
                        {positions[selectedField]?.color || "#000000"}
                      </span>
                    </div>
                  </div>

                  {/* Text Alignment */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-3 block">
                      Alignment
                    </label>
                    <div className="flex gap-1">
                      <Button
                        variant={
                          positions[selectedField]?.alignment === "left" ||
                          !positions[selectedField]?.alignment
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          if (selectedField) {
                            changeAlignment(selectedField, "left");
                          }
                        }}
                        className="flex-1 h-8"
                        style={{
                          backgroundColor:
                            positions[selectedField]?.alignment === "left" ||
                            !positions[selectedField]?.alignment
                              ? "#2D6A4F"
                              : "transparent",
                          borderColor: "#2D6A4F",
                          color:
                            positions[selectedField]?.alignment === "left" ||
                            !positions[selectedField]?.alignment
                              ? "white"
                              : "#2D6A4F"
                        }}
                        title="Align left">
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={
                          positions[selectedField]?.alignment === "center"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          if (selectedField) {
                            changeAlignment(selectedField, "center");
                          }
                        }}
                        className="flex-1 h-8"
                        style={{
                          backgroundColor:
                            positions[selectedField]?.alignment === "center"
                              ? "#2D6A4F"
                              : "transparent",
                          borderColor: "#2D6A4F",
                          color:
                            positions[selectedField]?.alignment === "center"
                              ? "white"
                              : "#2D6A4F"
                        }}
                        title="Align center">
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={
                          positions[selectedField]?.alignment === "right"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          if (selectedField) {
                            changeAlignment(selectedField, "right");
                          }
                        }}
                        className="flex-1 h-8"
                        style={{
                          backgroundColor:
                            positions[selectedField]?.alignment === "right"
                              ? "#2D6A4F"
                              : "transparent",
                          borderColor: "#2D6A4F",
                          color:
                            positions[selectedField]?.alignment === "right"
                              ? "white"
                              : "#2D6A4F"
                        }}
                        title="Align right">
                        <AlignRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Apply to All Button - More prominent placement */}
                  <div>
                    <button
                      onClick={() => {
                        const currentFormatting = positions[selectedField];
                        if (currentFormatting && tableData.length > 0) {
                          const updatedPositions = { ...positions };
                          Object.keys(tableData[0]).forEach((key) => {
                            if (updatedPositions[key]) {
                              updatedPositions[key] = {
                                ...updatedPositions[key],
                                fontSize: currentFormatting.fontSize,
                                fontFamily: currentFormatting.fontFamily,
                                bold: currentFormatting.bold,
                                italic: currentFormatting.italic,
                                color: currentFormatting.color,
                                alignment: currentFormatting.alignment
                              };
                            }
                          });
                          setPositions(updatedPositions);

                          setShowAppliedMessage(true);
                          setTimeout(() => setShowAppliedMessage(false), 2000);
                        }
                      }}
                      title="Apply this field's formatting to all fields"
                      className="w-full px-4 py-2 text-sm font-medium text-white rounded-md transition-all duration-200 shadow hover:shadow-md"
                      style={{
                        background:
                          "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
                        boxShadow: "0 2px 4px rgba(27, 67, 50, 0.2)",
                        color: "#FFFFFF"
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}>
                      Apply Formatting to All Fields
                    </button>
                  </div>

                  {/* Success message */}
                  {showAppliedMessage && (
                    <div
                      className="px-3 py-2 rounded text-sm text-center border"
                      style={{
                        backgroundColor: "#D1FAE5",
                        borderColor: "#52B788",
                        color: "#1B4332"
                      }}>
                      <Check className="h-4 w-4 inline mr-1" />
                      Formatting applied to all fields
                    </div>
                  )}

                  {/* Reset Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setShowResetFieldModal(true)}
                      disabled={!selectedField}
                      title="Reset this field to default formatting"
                      className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                        selectedField
                          ? "text-gray-700 bg-gray-100 hover:bg-gray-200"
                          : "text-gray-400 bg-gray-50 cursor-not-allowed"
                      }`}>
                      Reset Field
                    </button>

                    <button
                      onClick={() => setShowClearAllModal(true)}
                      title="Reset all fields to default formatting"
                      className="flex-1 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 transition-colors duration-200">
                      Clear All
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                  <div className="mb-3 flex justify-center">
                    <Edit3 className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium mb-1">
                    Select a text field to format
                  </p>
                  <p className="text-xs text-gray-400 mb-2">
                    Click on any text field in the certificate preview
                  </p>
                  {tableData.length > 0 && (
                    <div className="mt-3 p-2 rounded border border-green-300 bg-green-50">
                      <p className="text-xs text-gray-600 text-center">
                        Selected fields have a green border
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                  <Button
                    onClick={handleDownloadPdf}
                    className="text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)",
                      borderColor: "#E76F51",
                      boxShadow: "0 2px 4px rgba(231, 111, 81, 0.2)"
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background =
                        "linear-gradient(135deg, #F4A261 0%, #E9C46A 100%)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background =
                        "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)";
                    }}>
                    Download PDF
                  </Button>
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
      {(isGeneratingIndividual || individualPdfsData) && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
          onClick={() => {
            if (!isGeneratingIndividual) {
              setIndividualPdfsData(null);
              setSelectedNamingColumn("");
            }
          }}>
          <div
            className="relative bg-white bg-opacity-100 w-3/4 max-w-6xl mx-auto rounded-lg shadow-xl p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}>
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
                    <Button
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
                      className="text-white flex items-center gap-2"
                      style={{
                        background:
                          "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)",
                        borderColor: "#E76F51",
                        boxShadow: "0 2px 4px rgba(231, 111, 81, 0.2)"
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg, #F4A261 0%, #E9C46A 100%)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background =
                          "linear-gradient(135deg, #E76F51 0%, #F4A261 100%)";
                      }}>
                      <Download className="h-4 w-4" />
                      Download All (ZIP)
                    </Button>
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
          </div>
        </div>
      )}

      {/* Reset Field Confirmation Modal */}
      {showResetFieldModal && selectedField && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowResetFieldModal(false)}>
          <div
            className="relative bg-white bg-opacity-100 w-96 mx-auto rounded-lg shadow-xl p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">
              Reset Field Formatting
            </h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to reset the formatting for &quot;
              {selectedField}&quot; to default settings?
            </p>
            <div className="flex gap-3 justify-end">
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
            </div>
          </div>
        </div>
      )}

      {/* Clear All Formatting Confirmation Modal */}
      {showClearAllModal && (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowClearAllModal(false)}>
          <div
            className="relative bg-white bg-opacity-100 w-96 mx-auto rounded-lg shadow-xl p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Clear All Formatting</h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to reset all text fields to default
              formatting? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
