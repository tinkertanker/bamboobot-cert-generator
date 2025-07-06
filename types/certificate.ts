// Centralized type definitions for the certificate generator

// Font family types
export type FontFamily =
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

// Text alignment types
export type TextAlignment = "left" | "center" | "right";

// Tab types
export type TabType = "data" | "formatting" | "email";

// Position interface for text field positioning
export interface Position {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  alignment?: TextAlignment;
  isVisible?: boolean;
}

// Collection of positions indexed by field key
export interface Positions {
  [key: string]: Position;
}

// Table data row type
export interface TableData {
  [key: string]: string;
}

// Drag and drop information
export interface DragInfo {
  key: string;
  offsetX: number;
  offsetY: number;
  pointerId: number;
}

// Center guide display state
export interface CenterGuideState {
  horizontal: boolean;
  vertical: boolean;
}

// Email configuration
export interface EmailConfig {
  senderName: string;
  subject: string;
  message: string;
  deliveryMethod: "download" | "attachment";
  isConfigured: boolean;
}

// Email sending status tracking
export interface EmailSendingStatus {
  [key: number]: "sending" | "sent" | "error";
}

// PDF file information
export interface PdfFile {
  filename: string;
  url: string;
  originalIndex: number;
}

// Container dimensions for PDF generation
export interface ContainerDimensions {
  width: number;
  height: number;
}

// Text measurements for PDF generation
export interface TextMeasurements {
  width: number;
  height: number;
  actualHeight: number;
}

// PDF generation entry data
export interface PdfGenerationEntry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    uiMeasurements?: TextMeasurements;
  };
}

// PDF generation position data
export interface PdfGenerationPosition {
  x: number;
  y: number;
  fontSize: number;
  font: string;
  bold: boolean;
  oblique: boolean;
  alignment: string;
}

// Modal props interfaces for components
export interface BaseModalProps {
  onClose: () => void;
}

export interface PdfGenerationModalProps extends BaseModalProps {
  isGenerating: boolean;
  generatedPdfUrl: string | null;
  handleDownloadPdf: () => void;
  setGeneratedPdfUrl: (url: string | null) => void;
}

export interface IndividualPdfsModalProps extends BaseModalProps {
  isGeneratingIndividual: boolean;
  individualPdfsData: PdfFile[] | null;
  tableData: TableData[];
  selectedNamingColumn: string;
  setSelectedNamingColumn: (column: string) => void;
  emailSendingStatus: EmailSendingStatus;
  hasEmailColumn: boolean;
  emailConfig: EmailConfig;
  sendCertificateEmail: (index: number, file: PdfFile) => Promise<void>;
  setIndividualPdfsData: (data: PdfFile[] | null) => void;
}

export interface ConfirmationModalsProps {
  showResetFieldModal: boolean;
  setShowResetFieldModal: (show: boolean) => void;
  showClearAllModal: boolean;
  setShowClearAllModal: (show: boolean) => void;
  selectedField: string | null;
  positions: Positions;
  setPositions: React.Dispatch<React.SetStateAction<Positions>>;
  tableData: TableData[];
}

// Panel props interfaces
export interface CertificatePreviewProps {
  uploadedFileUrl: string | null;
  isLoading: boolean;
  tableData: TableData[];
  currentPreviewIndex: number;
  positions: Positions;
  selectedField: string | null;
  setSelectedField: (field: string | null) => void;
  isDragging: boolean;
  dragInfo: DragInfo | null;
  showCenterGuide: CenterGuideState;
  handlePointerDown: (event: React.PointerEvent, key: string) => void;
  handlePointerUp: (event: React.PointerEvent) => void;
  setShowCenterGuide: React.Dispatch<React.SetStateAction<CenterGuideState>>;
  // File upload props
  isDraggingFile: boolean;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleFileDrop: (event: React.DragEvent<HTMLDivElement>) => Promise<void>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export interface DataPanelProps {
  tableInput: string;
  handleTableDataChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isFirstRowHeader: boolean;
  handleHeaderToggle: () => void;
  useCSVMode: boolean;
  handleCSVModeToggle: () => void;
  tableData: TableData[];
  getTableProps: () => any;
  getTableBodyProps: () => any;
  headerGroups: any[];
  rows: any[];
  prepareRow: (row: any) => void;
  detectedEmailColumn: string | null;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number) => void;
}

export interface FormattingPanelProps {
  selectedField: string | null;
  setSelectedField: (field: string | null) => void;
  positions: Positions;
  setPositions: React.Dispatch<React.SetStateAction<Positions>>;
  tableData: TableData[];
  changeAlignment: (key: string, newAlignment: TextAlignment) => void;
  showAppliedMessage: boolean;
  setShowAppliedMessage: (show: boolean) => void;
  setShowResetFieldModal: (show: boolean) => void;
  setShowClearAllModal: (show: boolean) => void;
  setShowCenterGuide: React.Dispatch<React.SetStateAction<CenterGuideState>>;
}

export interface EmailConfigPanelProps {
  detectedEmailColumn: string | null;
  emailConfig: EmailConfig;
  setEmailConfig: React.Dispatch<React.SetStateAction<EmailConfig>>;
  selectedField: string | null;
  setSelectedField: (field: string | null) => void;
  setShowCenterGuide: React.Dispatch<React.SetStateAction<CenterGuideState>>;
}