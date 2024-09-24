"use client";

import { useState, useMemo, ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Spinner from "@/components/Spinner"; // Update the import path
import { useTable, Column, ColumnInstance, HeaderGroup, Row, Cell } from "react-table"; // Import react-table

interface TableData {
  [key: string]: string;
}

export default function MainPage() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [names, setNames] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false); // Add loading state
  const [fields, setFields] = useState<string>(""); // New state for fields
  const [tableData, setTableData] = useState<TableData[]>([]); // Explicitly define the type for table data
  const [isFirstRowHeader, setIsFirstRowHeader] = useState<boolean>(false); // New state for header toggle

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
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
    }
  };

  const handleNamesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setNames(event.target.value);
  };

  const handleFieldsChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setFields(event.target.value); // New handler for fields
  };

  const processTableData = (pastedData: string) => {
    const rows = pastedData.split("\n").map(row => row.split("\t"));
    const headers = isFirstRowHeader ? rows[0] : rows[0].map((_, index) => `Column ${index + 1}`);
    const data = isFirstRowHeader ? rows.slice(1) : rows;
    const tableData = data.map(row => {
      const obj: TableData = {};
      row.forEach((cell, index) => {
        obj[headers[index]] = cell;
      });
      return obj;
    });
    setTableData(tableData);
  };

  const handleTableDataChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const data = event.target.value;
    if (data.trim() === "") {
      setTableData([]); // Clear table data if input is empty
    } else {
      processTableData(data);
    }
  };

  const handleHeaderToggle = () => {
    setIsFirstRowHeader(!isFirstRowHeader);
    processTableData(fields); // Reprocess the table data when the checkbox state changes
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
          data: names.split("\n").map(name => ({ name: { text: name } })),
          positions: {
            name: { x: 0.5, y: 0.5, fontSize: 3 } // Adjust as needed
          }
        })
      });
      const data = await response.json();
      setGeneratedPdfUrl(data.outputPath);
      setIsGenerating(false);
    } catch (error) {
      console.error("Error generating PDF:", error);
      setIsGenerating(false);
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

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-primary text-primary-foreground py-4 px-6">
        <h1 className="text-2xl font-bold">Cert Generator Again</h1>
      </header>
      <main className="flex-1 grid grid-cols-2 gap-6 p-6">
        <div className="bg-card p-4 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Design</h2>
          <div className="relative">
            {isLoading && <Spinner />} {/* Show spinner while loading */}
            {uploadedFileUrl ? (
              <>
                <Image
                  src={uploadedFileUrl} // Use the uploaded file URL
                  alt="Certificate Template"
                  layout="responsive"
                  width={500} // specify the width
                  height={300} // specify the height
                />
                {names.split("\n").map((name, index) => (
                  <div
                    key={index}
                    className="absolute"
                    style={{
                      left: "50%",
                      top: "50%",
                      transform: "translate(-50%, -50%)",
                      fontSize: "24px",
                      fontWeight: "bold"
                    }}>
                    {name}
                  </div>
                ))}
                <div className="absolute bottom-4 right-4">
                  <Button
                    onClick={() => {
                      setUploadedFileUrl(null);
                      setUploadedFile(null);
                    }}>
                    Clear
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground bg-muted rounded-lg">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex items-center justify-center space-x-2">
                    <UploadIcon className="h-6 w-6" />
                    <span>Choose File</span>
                  </div>
                  <input
                    id="file-upload"
                    type="file"
                    onChange={handleFileUpload}
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
              onChange={handleTableDataChange} // Updated handler for table data
              placeholder="Paste tabular data here"
              className="w-full h-32 resize-none"
            />
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
        <div className="flex justify-end">
          <Button
            onClick={generatePdf}
            disabled={!uploadedFile || isGenerating}>
            {isGenerating ? "Generating..." : "Generate PDF"}
          </Button>
        </div>
      </footer>
      {generatedPdfUrl && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-medium mb-4">PDF Generated</h2>
            <iframe
              src={generatedPdfUrl}
              width="100%"
              height="600"
              title="Generated PDF"
            />
            <div className="flex justify-end mt-4">
              <Button onClick={() => setGeneratedPdfUrl(null)}>Close</Button>
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