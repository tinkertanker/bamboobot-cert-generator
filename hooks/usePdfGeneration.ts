import { useState, useCallback } from "react";
import { DEFAULT_FONT_SIZE } from "@/utils/constants";
import { measureText } from "@/utils/textMeasurement";
import type { TableData, Positions, PdfFile } from "@/types/certificate";

export interface UsePdfGenerationProps {
  tableData: TableData[];
  positions: Positions;
  uploadedFile: File | string | null;
  selectedNamingColumn: string;
  setSelectedNamingColumn: (column: string) => void;
}

export interface UsePdfGenerationReturn {
  isGenerating: boolean;
  isGeneratingIndividual: boolean;
  generatedPdfUrl: string | null;
  pdfDownloadUrl: string | null;
  individualPdfsData: PdfFile[] | null;
  generatePdf: () => Promise<void>;
  generateIndividualPdfs: () => Promise<void>;
  handleDownloadPdf: () => void;
  setGeneratedPdfUrl: (url: string | null) => void;
  setIndividualPdfsData: (data: { filename: string; url: string; originalIndex: number }[] | null) => void;
  clearPdfData: () => void;
}

export function usePdfGeneration({
  tableData,
  positions,
  uploadedFile,
  selectedNamingColumn,
  setSelectedNamingColumn
}: UsePdfGenerationProps): UsePdfGenerationReturn {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isGeneratingIndividual, setIsGeneratingIndividual] = useState<boolean>(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [individualPdfsData, setIndividualPdfsData] = useState<
    { filename: string; url: string; originalIndex: number }[] | null
  >(null);

  // Helper function to convert hex color to RGB array
  const hexToRgb = useCallback((hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
        ]
      : [0, 0, 0]; // Default to black if parsing fails
  }, []);

  // Helper function to prepare data for API
  const prepareDataForApi = useCallback(() => {
    return tableData.map((row) => {
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
    });
  }, [tableData, positions, hexToRgb]);

  // Helper function to prepare positions for API
  const preparePositionsForApi = useCallback(() => {
    return Object.fromEntries(
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
            alignment: pos.alignment || "left",
            textMode: pos.textMode || "shrink",
            width: pos.width || 90,
            lineHeight: pos.lineHeight || 1.2
          }
        ])
    );
  }, [positions]);

  // Helper function to get container dimensions
  const getContainerDimensions = useCallback(() => {
    const containerElement = document.querySelector(
      ".image-container img"
    ) as HTMLImageElement;
    return containerElement
      ? {
          width: containerElement.offsetWidth,
          height: containerElement.offsetHeight
        }
      : { width: 600, height: 400 }; // Fallback dimensions
  }, []);

  const generatePdf = useCallback(async () => {
    setIsGenerating(true);
    try {
      const containerDimensions = getContainerDimensions();

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          templateFilename: typeof uploadedFile === 'string' ? uploadedFile : uploadedFile?.name,
          uiContainerDimensions: containerDimensions,
          data: prepareDataForApi(),
          positions: preparePositionsForApi()
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
  }, [uploadedFile, getContainerDimensions, prepareDataForApi, preparePositionsForApi]);

  const generateIndividualPdfs = useCallback(async () => {
    setIsGeneratingIndividual(true);
    try {
      const containerDimensions = getContainerDimensions();

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "individual",
          templateFilename: typeof uploadedFile === 'string' ? uploadedFile : uploadedFile?.name,
          uiContainerDimensions: containerDimensions,
          namingColumn: selectedNamingColumn,
          data: prepareDataForApi(),
          positions: preparePositionsForApi()
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
  }, [
    uploadedFile,
    selectedNamingColumn,
    tableData,
    setSelectedNamingColumn,
    getContainerDimensions,
    prepareDataForApi,
    preparePositionsForApi
  ]);

  const handleDownloadPdf = useCallback(() => {
    if (pdfDownloadUrl) {
      // Use force-download API to ensure proper download
      const downloadUrl = `/api/force-download?url=${encodeURIComponent(pdfDownloadUrl)}&filename=generated_certificates.pdf`;
      window.location.href = downloadUrl;
    }
  }, [pdfDownloadUrl]);

  const clearPdfData = useCallback(() => {
    setGeneratedPdfUrl(null);
    setPdfDownloadUrl(null);
    setIndividualPdfsData(null);
    setIsGenerating(false);
    setIsGeneratingIndividual(false);
  }, []);

  return {
    isGenerating,
    isGeneratingIndividual,
    generatedPdfUrl,
    pdfDownloadUrl,
    individualPdfsData,
    generatePdf,
    generateIndividualPdfs,
    handleDownloadPdf,
    setGeneratedPdfUrl,
    setIndividualPdfsData,
    clearPdfData,
  };
}