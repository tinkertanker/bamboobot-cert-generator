"use client";

import { useState, useMemo, ChangeEvent, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import Spinner from "@/components/Spinner"; // Update the import path
import { useTable, Column, ColumnInstance, HeaderGroup, Row, Cell } from "react-table"; // Import react-table
import { saveAs } from 'file-saver'; // Add this import

interface TableData {
  [key: string]: string;
}

interface Position {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: 'Helvetica' | 'Times' | 'Courier';
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

interface Positions {
  [key: string]: Position;
}

export default function MainPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  // State variables for the application
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Add loading state
  const [tableData, setTableData] = useState<TableData[]>([]); // Explicitly define the type for table data
  const [isFirstRowHeader, setIsFirstRowHeader] = useState<boolean>(false); // New state for header toggle
  const [tableInput, setTableInput] = useState<string>(""); // New state for table input
  const [positions, setPositions] = useState<Positions>({}); // Add new state for positions
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'data' | 'formatting'>('data');
  const [showAppliedMessage, setShowAppliedMessage] = useState<boolean>(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState<number>(0);
  
  // Pointer events state for dragging
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragInfo, setDragInfo] = useState<{
    key: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);

  // Text measurement utility for consistent sizing
  const measureText = useCallback((text: string, fontSize: number, fontWeight: string = '500', fontFamily: string = 'system-ui, sans-serif') => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    return {
      width: metrics.width,
      height: fontSize, // Approximate height - could use actualBoundingBoxAscent + actualBoundingBoxDescent for precision
      actualHeight: (metrics.actualBoundingBoxAscent || fontSize * 0.8) + (metrics.actualBoundingBoxDescent || fontSize * 0.2)
    };
  }, []);

  // Global pointer event handlers for smooth dragging
  useEffect(() => {
    const handleGlobalPointerMove = (event: PointerEvent) => {
      if (!isDragging || !dragInfo) return;
      
      const imageContainer = document.querySelector('.image-container');
      if (imageContainer) {
        const containerRect = imageContainer.getBoundingClientRect();
        
        // Calculate position accounting for initial offset
        const x = ((event.clientX - dragInfo.offsetX - containerRect.left) / containerRect.width) * 100;
        const y = ((event.clientY - dragInfo.offsetY - containerRect.top) / containerRect.height) * 100;
        
        // Define the threshold (e.g., 10% from the edge)
        const threshold = 10;
        
        if (x < -threshold || x > 100 + threshold || y < -threshold || y > 100 + threshold) {
          // If dragged too far, reset to center but preserve other properties
          setPositions(prev => ({ ...prev, [dragInfo.key]: { ...prev[dragInfo.key], x: 50, y: 50 } }));
        } else {
          // Clamp the values between 0 and 100 but preserve other properties
          const clampedX = Math.max(0, Math.min(100, x));
          const clampedY = Math.max(0, Math.min(100, y));
          
          setPositions(prev => ({ ...prev, [dragInfo.key]: { ...prev[dragInfo.key], x: clampedX, y: clampedY } }));
        }
      }
    };

    const handleGlobalPointerUp = (event: PointerEvent) => {
      if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId) return;
      
      setIsDragging(false);
      setDragInfo(null);
    };

    if (isDragging) {
      document.addEventListener('pointermove', handleGlobalPointerMove);
      document.addEventListener('pointerup', handleGlobalPointerUp);
      document.addEventListener('pointercancel', handleGlobalPointerUp);
      
      return () => {
        document.removeEventListener('pointermove', handleGlobalPointerMove);
        document.removeEventListener('pointerup', handleGlobalPointerUp);
        document.removeEventListener('pointercancel', handleGlobalPointerUp);
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

  // Ensure all table columns have positions and reset preview index
  useEffect(() => {
    if (tableData.length > 0) {
      // Reset preview index when table data changes
      setCurrentPreviewIndex(0);
      
      setPositions(prevPositions => {
        const newPositions = { ...prevPositions };
        let hasNewPositions = false;
        
        Object.keys(tableData[0]).forEach((key, index) => {
          if (!newPositions[key]) {
            newPositions[key] = { x: 50, y: 50 + index * 10, fontSize: 24, fontFamily: 'Helvetica', color: '#000000' };
            hasNewPositions = true;
          }
        });
        
        return hasNewPositions ? newPositions : prevPositions;
      });
    }
  }, [tableData]);

  const processFile = async (file: File) => {
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      setUploadedFile(file);
      setIsLoading(true); // Set loading to true
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
        setUploadedFileUrl(data.image); // Set the image URL
      } catch (error) {
        console.error("Error uploading file:", error);
      } finally {
        setIsLoading(false); // Set loading to false after upload
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

  // Event handlers for form elements


  const processTableData = (input: string, useHeaderRow: boolean = isFirstRowHeader) => {
    const rows = input.trim().split("\n").map(row => row.split("\t"));
    if (rows.length === 0) return;

    const headers = useHeaderRow ? rows[0] : rows[0].map((_, index) => `Column ${index + 1}`);
    const data = useHeaderRow ? rows.slice(1) : rows;
    const tableData = data.map(row => {
      const obj: TableData = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || "";
      });
      return obj;
    });
    setTableData(tableData);
  };

  const handleTableDataChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newInput = event.target.value;
    setTableInput(newInput);
    if (newInput.trim() === '') {
      setTableData([]); // Clear the table data when input is empty
    } else {
      processTableData(newInput, isFirstRowHeader);
    }
  };

  const handleHeaderToggle = () => {
    setIsFirstRowHeader(prev => {
      const newValue = !prev;
      processTableData(tableInput, newValue);
      return newValue;
    });
  };

  // Navigation functions
  const goToFirst = () => setCurrentPreviewIndex(0);
  const goToPrevious = () => setCurrentPreviewIndex(prev => Math.max(0, prev - 1));
  const goToNext = () => setCurrentPreviewIndex(prev => Math.min(tableData.length - 1, prev + 1));
  const goToLast = () => setCurrentPreviewIndex(tableData.length - 1);

  // Helper function to convert hex color to RGB array
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ] : [0, 0, 0]; // Default to black if parsing fails
  };

  const generatePdf = async () => {
    setIsGenerating(true);
    try {
      // Measure actual container dimensions
      const containerElement = document.querySelector('.image-container img') as HTMLImageElement;
      const containerDimensions = containerElement ? {
        width: containerElement.offsetWidth,
        height: containerElement.offsetHeight
      } : { width: 600, height: 400 }; // Fallback dimensions

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          templateFilename: uploadedFile,
          uiContainerDimensions: containerDimensions,
          data: tableData.map(row => {
            const entry: { [key: string]: { text: string; color?: [number, number, number]; uiMeasurements?: { width: number; height: number; actualHeight: number } } } = {};
            Object.keys(row).forEach(key => {
              const fontSize = 24; // Current UI font size
              const measurements = measureText(row[key], fontSize, '500');
              const position = positions[key];
              entry[key] = { 
                text: row[key],
                color: position?.color ? hexToRgb(position.color) : hexToRgb('#000000'),
                uiMeasurements: measurements
              };
            });
            return entry;
          }),
          positions: Object.fromEntries(
            Object.entries(positions).map(([key, pos]) => [
              key,
              {
                x: pos.x / 100, // Convert percentage to 0-1 range
                y: pos.y / 100, // Convert percentage to 0-1 range (no inversion)
                fontSize: pos.fontSize || 24, // Use custom fontSize or default to 24
                font: pos.fontFamily || 'Helvetica', // Send font family to backend
                bold: pos.bold || false, // Send bold state
                oblique: pos.italic || false // Send italic state (backend uses 'oblique')
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

  const handleDownloadPdf = () => {
    if (pdfDownloadUrl) {
      // Create full URL from relative path
      const fullUrl = pdfDownloadUrl.startsWith('http') 
        ? pdfDownloadUrl 
        : `${window.location.origin}${pdfDownloadUrl}`;
      saveAs(fullUrl, 'generated_certificates.pdf');
    }
  };

  const columns: Column<TableData>[] = useMemo(
    () => tableData.length > 0 ? Object.keys(tableData[0]).map(key => ({ Header: key, accessor: key })) : [],
    [tableData]
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow
  } = useTable({ columns, data: tableData });

  // Pointer event handlers for precise dragging
  const handlePointerDown = useCallback((event: React.PointerEvent, key: string) => {
    event.preventDefault();
    
    // Select the field for formatting and switch to formatting tab
    setSelectedField(key);
    setActiveTab('formatting');
    
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    
    // Calculate offset from element center (accounting for transform: translate(-50%, -50%))
    const offsetX = event.clientX - (rect.left + rect.width / 2);
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
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (!isDragging || !dragInfo || event.pointerId !== dragInfo.pointerId) return;
    
    event.preventDefault();
    
    setIsDragging(false);
    setDragInfo(null);
    
    // Release pointer capture
    const element = event.currentTarget as HTMLElement;
    element.releasePointerCapture(event.pointerId);
  }, [isDragging, dragInfo]);

  return (
    <div className="flex flex-col h-screen">
      <header className="py-4 px-6" style={{
        background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)',
        boxShadow: '0 2px 4px rgba(27, 67, 50, 0.1)'
      }}>
        <h1 className="text-2xl font-bold" style={{color: '#F4A261'}}>Bamboobot</h1>
      </header>
      <main className="flex-1 grid grid-cols-[60%_40%] gap-6 p-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <div className="relative w-full image-container"> {/* Add image-container class */}
            {isLoading && <Spinner />} {/* Show spinner while loading */}
            {uploadedFileUrl ? (
              <>
                <div className="border-4 border-gray-700 inline-block relative w-full">
                  <img
                    src={uploadedFileUrl} // Use the uploaded file URL
                    alt="Certificate Template"
                    className="w-full h-auto block"
                  />
                  <div className="absolute inset-0">
                    {tableData.length > 0 && Object.entries(tableData[currentPreviewIndex] || tableData[0]).map(([key, value], index) => {
                    const isCurrentlyDragging = isDragging && dragInfo?.key === key;
                    const isSelected = selectedField === key;
                    const fontSize = positions[key]?.fontSize || 24;
                    const fontFamily = positions[key]?.fontFamily || 'Helvetica';
                    const isBold = positions[key]?.bold || false;
                    const isItalic = positions[key]?.italic || false;
                    const textColor = positions[key]?.color || '#000000';
                    
                    // Map font names to CSS font families
                    const fontFamilyMap = {
                      'Helvetica': '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
                      'Times': 'Times, "Times New Roman", Georgia, serif',
                      'Courier': 'Courier, "Courier New", monospace'
                    };
                    
                    const style = {
                      left: `${positions[key]?.x ?? 50}%`,
                      top: `${positions[key]?.y ?? (50 + index * 10)}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: `${fontSize}px`,
                      fontFamily: fontFamilyMap[fontFamily],
                      fontWeight: isBold ? 'bold' : 'normal',
                      fontStyle: isItalic ? 'italic' : 'normal',
                      color: textColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      position: 'absolute' as const,
                      pointerEvents: 'auto' as const,
                      userSelect: 'none' as const,
                      touchAction: 'none',
                      backgroundColor: isCurrentlyDragging ? 'rgba(231, 111, 81, 0.15)' : isSelected ? 'rgba(45, 106, 79, 0.15)' : 'transparent',
                      border: isCurrentlyDragging ? '2px solid #E76F51' : isSelected ? '2px solid #2D6A4F' : '2px solid transparent',
                      borderRadius: '4px',
                      padding: '2px 4px',
                      cursor: isCurrentlyDragging ? 'grabbing' : 'grab',
                    };

                    return (
                      <div
                        key={key}
                        className="absolute"
                        style={style}
                        onPointerDown={(e) => handlePointerDown(e, key)}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        {value}
                      </div>
                    );
                  })}
                  </div>
                </div>
              </>
            ) : (
              <div 
                className={`flex items-center justify-center h-64 rounded-lg border-2 border-dashed transition-colors ${
                  isDraggingFile 
                    ? 'text-white' 
                    : 'text-gray-600 bg-gray-50'
                }`}
                style={{
                  borderColor: isDraggingFile ? '#2D6A4F' : '#D1D5DB',
                  backgroundColor: isDraggingFile ? 'rgba(45, 106, 79, 0.1)' : '#F9FAFB'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleFileDrop}
              >
                <label htmlFor="file-upload" className="cursor-pointer w-full h-full flex items-center justify-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <UploadIcon className={`h-12 w-12 ${isDraggingFile ? 'animate-pulse' : ''}`} />
                    <span className="text-center">
                      {isDraggingFile 
                        ? 'Drop your image here' 
                        : 'Choose File or Drag & Drop (JPEG or PNG)'
                      }
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
                      setPositions({}); // Reset positions when clearing the image
                      // Clear any active drag state
                      setIsDragging(false);
                      setDragInfo(null);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-white"
                    style={{
                      background: 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)',
                      borderColor: '#2D6A4F',
                      boxShadow: '0 1px 3px rgba(45, 106, 79, 0.2)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #40916C 0%, #52B788 100%)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)';
                    }}
                  >
                    Clear Template
                  </Button>
                </div>
                
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
                        className={currentPreviewIndex === 0 ? "text-gray-400 border-gray-300 px-2" : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"}
                        title="First entry"
                        onClick={goToFirst}
                      >
                        ⏮
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === 0}
                        className={currentPreviewIndex === 0 ? "text-gray-400 border-gray-300 px-2" : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"}
                        title="Previous entry"
                        onClick={goToPrevious}
                      >
                        ◀
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === tableData.length - 1}
                        className={currentPreviewIndex === tableData.length - 1 ? "text-gray-400 border-gray-300 px-2" : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"}
                        title="Next entry"
                        onClick={goToNext}
                      >
                        ▶
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPreviewIndex === tableData.length - 1}
                        className={currentPreviewIndex === tableData.length - 1 ? "text-gray-400 border-gray-300 px-2" : "text-gray-700 border-gray-400 px-2 hover:bg-gray-50"}
                        title="Last entry"
                        onClick={goToLast}
                      >
                        ⏭
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="bg-card p-4 rounded-lg shadow">
          {/* Tab Navigation */}
          <div className="flex mb-4 bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('data')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              style={{
                backgroundColor: activeTab === 'data' ? '#2D6A4F' : '#ffffff',
                color: activeTab === 'data' ? '#ffffff' : '#374151'
              }}
            >
              Data
            </button>
            <button
              onClick={() => setActiveTab('formatting')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex-1 text-center`}
              style={{
                backgroundColor: activeTab === 'formatting' ? '#2D6A4F' : '#ffffff',
                color: activeTab === 'formatting' ? '#ffffff' : '#374151'
              }}
            >
              Formatting
              {selectedField && (
                <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === 'formatting' 
                    ? 'text-amber-600' 
                    : 'text-green-800'
                }`}
                style={{
                  backgroundColor: activeTab === 'formatting' ? '#F4A261' : '#D1FAE5'
                }}>
                  {selectedField}
                </span>
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'data' && (
            <div>
              <div className="flex items-center mb-4">
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
              <Textarea
                value={tableInput}
                onChange={handleTableDataChange}
                placeholder="Paste tabular data here"
                className="w-full h-32 resize-none"
              />
              {tableData.length > 0 && (
                <div className="mt-4">
                  <table {...getTableProps()} className="min-w-full bg-white">
                    <thead>
                      {headerGroups.map((headerGroup: HeaderGroup<TableData>) => (
                        <tr
                          {...headerGroup.getHeaderGroupProps()}
                          key={headerGroup.id}>
                          {headerGroup.headers.map(
                            (column: ColumnInstance<TableData>) => (
                              <th
                                {...column.getHeaderProps()}
                                className="px-4 py-2 border"
                                key={column.id}>
                                {column.render("Header")}
                              </th>
                            )
                          )}
                        </tr>
                      ))}
                    </thead>
                    <tbody {...getTableBodyProps()}>
                      {rows.map((row: Row<TableData>) => {
                        prepareRow(row);
                        return (
                          <tr {...row.getRowProps()} key={row.getRowProps().key}>
                            {row.cells.map((cell: Cell<TableData>) => (
                              <td
                                {...cell.getCellProps()}
                                className="px-4 py-2 border"
                                key={cell.getCellProps().key}>
                                {cell.render("Cell")}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'formatting' && (
            <div>
              {selectedField ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded border relative">
                    <h3 className="font-medium text-sm">Field: {selectedField}</h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedField(null)}
                    >
                      ✕
                    </Button>
                  </div>
                  
                  {/* Compact Font Size + Family Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Font Size</label>
                      <div className="flex items-center space-x-1">
                        <input
                          type="number"
                          min="8"
                          max="72"
                          value={positions[selectedField]?.fontSize || 24}
                          onChange={(e) => {
                            const newFontSize = parseInt(e.target.value) || 24;
                            setPositions(prev => ({
                              ...prev,
                              [selectedField]: {
                                ...prev[selectedField],
                                fontSize: newFontSize
                              }
                            }));
                          }}
                          className="w-12 px-1 py-1 border rounded text-xs"
                        />
                        <span className="text-xs text-gray-500">px</span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Font Family</label>
                      <Select
                        value={positions[selectedField]?.fontFamily || 'Helvetica'}
                        onChange={(e) => {
                          const newFontFamily = e.target.value as 'Helvetica' | 'Times' | 'Courier';
                          setPositions(prev => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              fontFamily: newFontFamily
                            }
                          }));
                        }}
                        className="text-xs"
                      >
                        <option value="Helvetica">Helvetica</option>
                        <option value="Times">Times</option>
                        <option value="Courier">Courier</option>
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
                        setPositions(prev => ({
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
                  
                  {/* Font Style Buttons */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-2 block">Font Style</label>
                    <div className="flex gap-2">
                      <Button
                        variant={positions[selectedField]?.bold ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setPositions(prev => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              bold: !prev[selectedField]?.bold
                            }
                          }));
                        }}
                        className="flex-1 h-8"
                        style={{
                          backgroundColor: positions[selectedField]?.bold ? '#2D6A4F' : 'transparent',
                          borderColor: '#2D6A4F',
                          color: positions[selectedField]?.bold ? 'white' : '#2D6A4F'
                        }}
                      >
                        <strong>B</strong>
                      </Button>
                      <Button
                        variant={positions[selectedField]?.italic ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setPositions(prev => ({
                            ...prev,
                            [selectedField]: {
                              ...prev[selectedField],
                              italic: !prev[selectedField]?.italic
                            }
                          }));
                        }}
                        className="flex-1 h-8"
                        style={{
                          backgroundColor: positions[selectedField]?.italic ? '#2D6A4F' : 'transparent',
                          borderColor: '#2D6A4F',
                          color: positions[selectedField]?.italic ? 'white' : '#2D6A4F'
                        }}
                      >
                        <em>I</em>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Text Color Picker */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-2 block">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={positions[selectedField]?.color || '#000000'}
                        onChange={(e) => {
                          setPositions(prev => ({
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
                        {positions[selectedField]?.color || '#000000'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Apply to All Button - More prominent placement */}
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <button
                      onClick={() => {
                        // Apply current field's formatting to all fields
                        const currentFormatting = positions[selectedField];
                        if (currentFormatting && tableData.length > 0) {
                          const updatedPositions = { ...positions };
                          Object.keys(tableData[0]).forEach(key => {
                            if (updatedPositions[key]) {
                              updatedPositions[key] = {
                                ...updatedPositions[key],
                                fontSize: currentFormatting.fontSize,
                                fontFamily: currentFormatting.fontFamily,
                                bold: currentFormatting.bold,
                                italic: currentFormatting.italic,
                                color: currentFormatting.color
                              };
                            }
                          });
                          setPositions(updatedPositions);
                          
                          // Show success message
                          setShowAppliedMessage(true);
                          setTimeout(() => setShowAppliedMessage(false), 2000);
                        }
                      }}
                      title="Apply this field's formatting to all fields"
                      className="w-full px-4 py-2 text-sm font-medium text-white rounded-md transition-all duration-200 shadow hover:shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)',
                        boxShadow: '0 2px 4px rgba(45, 106, 79, 0.2)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #40916C 0%, #52B788 100%)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      Apply Formatting to All Fields
                    </button>
                  </div>
                  
                  {/* Success message */}
                  {showAppliedMessage && (
                    <div className="px-3 py-2 rounded text-sm text-center border"
                         style={{
                           backgroundColor: '#D1FAE5',
                           borderColor: '#52B788',
                           color: '#1B4332'
                         }}>
                      ✓ Formatting applied to all fields
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                  <div className="mb-3 text-2xl">✎</div>
                  <p className="text-sm font-medium mb-1">Select a text field to format</p>
                  <p className="text-xs text-gray-400 mb-2">Click on any text field in the certificate preview</p>
                  {tableData.length > 0 && (
                    <p className="text-xs text-blue-600">◯ Selected fields have a green border</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <footer className="py-4 px-6 fixed bottom-0 left-0 right-0" style={{
        background: 'linear-gradient(45deg, #1B4332 0%, #2D6A4F 100%)',
        boxShadow: '0 -2px 4px rgba(27, 67, 50, 0.1)'
      }}>
        <div className="flex justify-end space-x-4">
          <Button
            onClick={generatePdf}
            disabled={!uploadedFile || isGenerating}
            className="text-white font-semibold px-6"
            style={{
              background: !uploadedFile || isGenerating 
                ? 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 100%)' 
                : 'linear-gradient(135deg, #E76F51 0%, #F4A261 100%)',
              borderColor: '#E76F51',
              boxShadow: !uploadedFile || isGenerating 
                ? '0 2px 4px rgba(107, 114, 128, 0.2)'
                : '0 2px 4px rgba(231, 111, 81, 0.2)'
            }}
            onMouseOver={(e) => {
              if (!(!uploadedFile || isGenerating)) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #D65A3A 0%, #E76F51 100%)';
              }
            }}
            onMouseOut={(e) => {
              if (!(!uploadedFile || isGenerating)) {
                e.currentTarget.style.background = 'linear-gradient(135deg, #E76F51 0%, #F4A261 100%)';
              }
            }}>
            {isGenerating ? "Generating..." : "Generate PDF"}
          </Button>
        </div>
      </footer>
      {(isGenerating || generatedPdfUrl) && (
        <div className="fixed inset-0 z-50 overflow-auto bg-primary bg-opacity-50 flex items-center justify-center">
          <div className="relative bg-secondary w-11/12 md:w-3/4 lg:w-1/2 max-w-4xl mx-auto rounded-lg shadow-lg p-6">
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
                      background: 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)',
                      borderColor: '#2D6A4F',
                      boxShadow: '0 2px 4px rgba(45, 106, 79, 0.2)'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #40916C 0%, #52B788 100%)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)';
                    }}>
                    Download PDF
                  </Button>
                  <Button 
                    onClick={() => setGeneratedPdfUrl(null)}
                    variant="outline"
                    style={{
                      borderColor: '#6B7280',
                      color: '#6B7280'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#F3F4F6';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}>Close</Button>
                </div>
              </>
            ) : null}
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