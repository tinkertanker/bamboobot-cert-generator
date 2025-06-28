"use client";

import { useState, useMemo, ChangeEvent, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Spinner from "@/components/Spinner"; // Update the import path
import { useTable, Column, ColumnInstance, HeaderGroup, Row, Cell } from "react-table"; // Import react-table
import { saveAs } from 'file-saver'; // Add this import

interface TableData {
  [key: string]: string;
}

interface Position {
  x: number;
  y: number;
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
  const [fields, setFields] = useState<string>(""); // New state for fields
  const [tableData, setTableData] = useState<TableData[]>([]); // Explicitly define the type for table data
  const [isFirstRowHeader, setIsFirstRowHeader] = useState<boolean>(false); // New state for header toggle
  const [tableInput, setTableInput] = useState<string>(""); // New state for table input
  const [positions, setPositions] = useState<Positions>({}); // Add new state for positions
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Ensure all table columns have positions
  useEffect(() => {
    if (tableData.length > 0) {
      setPositions(prevPositions => {
        const newPositions = { ...prevPositions };
        let hasNewPositions = false;
        
        Object.keys(tableData[0]).forEach((key, index) => {
          if (!newPositions[key]) {
            newPositions[key] = { x: 50, y: 50 + index * 10 };
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

  const handleFieldsChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setFields(event.target.value); // New handler for fields
  };

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

  const generatePdf = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          templateFilename: uploadedFile,
          data: tableData.map(row => {
            const entry: { [key: string]: { text: string } } = {};
            Object.keys(row).forEach(key => {
              entry[key] = { text: row[key] };
            });
            return entry;
          }),
          positions: Object.fromEntries(
            Object.entries(positions).map(([key, pos]) => [
              key,
              {
                x: pos.x / 100, // Convert percentage to 0-1 range
                y: pos.y / 100, // Convert percentage to 0-1 range (no inversion)
                fontSize: 24 // Default size for certificate text
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

  const handleDragStart = useCallback((key: string) => {
    setDraggingKey(key);
  }, []);

  const handleDrag = useCallback((event: React.DragEvent | MouseEvent, key: string) => {
    const imageContainer = document.querySelector('.image-container');
    if (imageContainer) {
      const rect = imageContainer.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      
      // Define the threshold (e.g., 10% from the edge)
      const threshold = 10;
      
      if (x < -threshold || x > 100 + threshold || y < -threshold || y > 100 + threshold) {
        // If dragged too far, reset to center
        setPositions(prev => ({ ...prev, [key]: { x: 50, y: 50 } }));
      } else {
        // Clamp the values between 0 and 100
        const clampedX = Math.max(0, Math.min(100, x));
        const clampedY = Math.max(0, Math.min(100, y));
        
        setPositions(prev => ({ ...prev, [key]: { x: clampedX, y: clampedY } }));
      }
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingKey(null);
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-primary text-primary-foreground py-4 px-6">
        <h1 className="text-2xl font-bold">Cert Generator Again</h1>
      </header>
      <main className="flex-1 grid grid-cols-2 gap-6 p-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Design</h2>
          <div className="relative w-full aspect-[16/9] image-container"> {/* Add image-container class */}
            {isLoading && <Spinner />} {/* Show spinner while loading */}
            {uploadedFileUrl ? (
              <>
                <div className="border-4 border-gray-700 inline-block relative w-full h-full overflow-hidden">
                  <Image
                    src={uploadedFileUrl} // Use the uploaded file URL
                    alt="Certificate Template"
                    fill
                    style={{ objectFit: 'contain' }}
                  />
                  {tableData.length > 0 && Object.entries(tableData[0]).map(([key, value], index) => {
                    const isDragging = draggingKey === key;
                    const style = {
                      left: `${positions[key]?.x ?? 50}%`,
                      top: `${positions[key]?.y ?? (50 + index * 10)}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                      position: 'absolute' as const,
                      pointerEvents: 'auto',
                      opacity: isDragging ? '0.05' : '1',
                    };

                    return (
                      <div
                        key={key}
                        className="absolute cursor-move"
                        style={style}
                        draggable
                        onDragStart={() => handleDragStart(key)}
                        onDrag={(e) => handleDrag(e, key)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                      >
                        {value}
                      </div>
                    );
                  })}
                </div>
                <div className="absolute bottom-4 right-4">
                  <Button
                    onClick={() => {
                      setUploadedFileUrl(null);
                      setUploadedFile(null);
                      setPositions({}); // Reset positions when clearing the image
                    }}>
                    Clear
                  </Button>
                </div>
              </>
            ) : (
              <div 
                className={`flex items-center justify-center h-64 text-muted-foreground rounded-lg border-2 border-dashed transition-colors ${
                  isDraggingFile 
                    ? 'border-primary bg-primary/10 text-primary' 
                    : 'border-muted-foreground/25 bg-muted'
                }`}
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
        </div>
        <div className="bg-card p-4 rounded-lg shadow">
          <div>
            <h2 className="text-lg font-medium mb-4">Data</h2>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="header-toggle"
                checked={isFirstRowHeader}
                onChange={handleHeaderToggle} // Updated handler for checkbox
                className="mr-2"
              />
              <label htmlFor="header-toggle">Treat first row as header</label>
            </div>
            <Textarea
              value={tableInput}
              onChange={handleTableDataChange} // Updated handler for table data
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
          <div>
            <h2 className="text-lg font-medium mb-4">Formatting</h2>
            <Textarea
              value={fields} // New state for fields
              onChange={handleFieldsChange} // New handler for fields
              placeholder="Enter fields, one per line"
              className="w-full h-32 resize-none mb-4" // Adjust height and margin
            />
          </div>
        </div>
      </main>
      <footer className="bg-primary text-primary-foreground py-4 px-6 fixed bottom-0 left-0 right-0">
        <div className="flex justify-end space-x-4">
          <Button
            onClick={generatePdf}
            disabled={!uploadedFile || isGenerating}>
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
                  <Button onClick={handleDownloadPdf}>
                    Download PDF
                  </Button>
                  <Button onClick={() => setGeneratedPdfUrl(null)}>Close</Button>
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