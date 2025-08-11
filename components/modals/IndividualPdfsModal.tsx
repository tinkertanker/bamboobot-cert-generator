import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import SpinnerInline from "@/components/SpinnerInline";
import { BulkEmailModal } from "./BulkEmailModal";
import { saveAs } from "file-saver";
import type { IndividualPdfsModalProps } from "@/types/certificate";
import {
  ExternalLink,
  Download,
  FileText,
  Check,
  Mail,
  X,
  Pause,
  Play,
  AlertCircle,
  Clock,
  CheckCircle
} from "lucide-react";

export function IndividualPdfsModal({
  isGeneratingIndividual,
  individualPdfsData,
  tableData,
  selectedNamingColumn,
  setSelectedNamingColumn,
  emailSendingStatus,
  hasEmailColumn,
  emailConfig,
  sendCertificateEmail,
  setIndividualPdfsData,
  onClose,
  detectedEmailColumn,
  // Progressive generation props
  isProgressiveMode = false,
  progressiveProgress,
  progressiveError,
  onProgressivePause,
  onProgressiveResume,
  onProgressiveCancel,
  // Legacy progress props (for non-progressive mode)
  progress,
  total
}: IndividualPdfsModalProps & { progress?: number; total?: number }) {
  const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  
  // Reset bulk email modal state when the modal opens
  useEffect(() => {
    if (individualPdfsData) {
      setShowBulkEmailModal(false);
    }
  }, [individualPdfsData]);
  
  return (
    <Modal
      open={isGeneratingIndividual || !!individualPdfsData || (isProgressiveMode && !!progressiveProgress)}
      onClose={() => {
        if (!isGeneratingIndividual && (!isProgressiveMode || progressiveProgress?.status === 'completed' || progressiveProgress?.status === 'error')) {
          setIndividualPdfsData(null);
          setSelectedNamingColumn("");
          setShowBulkEmailModal(false);  // Reset bulk email modal state
          onClose();
        }
      }}
      closeOnBackdropClick={!isGeneratingIndividual && (!isProgressiveMode || progressiveProgress?.status === 'completed' || progressiveProgress?.status === 'error')}
      width="w-3/4 max-w-6xl"
      className="h-auto max-h-[90vh] overflow-y-auto">
      {isGeneratingIndividual ? (
        <div className="flex flex-col items-center justify-center">
          {/* Progressive Generation UI */}
          {isProgressiveMode && progressiveProgress ? (
            <div className="w-full space-y-6">
              <h3 className="text-2xl font-bold text-center mb-6">Generating Individual PDFs</h3>
              
              {/* Progress Bar */}
              <div className="w-full max-w-2xl mx-auto">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    {progressiveProgress.processed} of {progressiveProgress.total} processed
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {Math.round((progressiveProgress.processed / progressiveProgress.total) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={progressiveProgress.processed} 
                  max={progressiveProgress.total}
                  className="h-3"
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-700">{progressiveProgress.processed}</p>
                  <p className="text-sm text-gray-600">Completed</p>
                </div>
                {progressiveProgress.failed > 0 && (
                  <div className="bg-red-50 p-4 rounded-lg text-center">
                    <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-red-700">{progressiveProgress.failed}</p>
                    <p className="text-sm text-gray-600">Failed</p>
                  </div>
                )}
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <Clock className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-blue-700">
                    {progressiveProgress.estimatedTimeRemaining 
                      ? `${Math.ceil(progressiveProgress.estimatedTimeRemaining / 1000)}s`
                      : '...'}
                  </p>
                  <p className="text-sm text-gray-600">Time Remaining</p>
                </div>
              </div>

              {/* Current Item */}
              {progressiveProgress.currentItem && (
                <div className="text-center">
                  <p className="text-sm text-gray-500">Currently processing:</p>
                  <p className="font-medium">{progressiveProgress.currentItem}</p>
                </div>
              )}

              {/* Control Buttons */}
              <div className="flex justify-center gap-3">
                {progressiveProgress.status === 'processing' ? (
                  <Button
                    onClick={onProgressivePause}
                    variant="outline"
                    className="flex items-center gap-2">
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : progressiveProgress.status === 'paused' ? (
                  <Button
                    onClick={onProgressiveResume}
                    variant="outline"
                    className="flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                ) : null}
                <Button
                  onClick={onProgressiveCancel}
                  variant="outline"
                  className="text-red-600 hover:text-red-700 flex items-center gap-2">
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>

              {/* Errors */}
              {progressiveProgress.errors && progressiveProgress.errors.length > 0 && (
                <div className="mt-4 max-w-2xl mx-auto">
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Errors:</h4>
                  <div className="max-h-32 overflow-y-auto bg-red-50 p-3 rounded text-sm">
                    {progressiveProgress.errors.map((err, idx) => (
                      <div key={idx} className="text-red-700">
                        Entry {err.index + 1}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : progressiveError ? (
            /* Error State */
            <div className="text-center py-8">
              <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Generation Failed</h3>
              <p className="text-gray-600 mb-6">{progressiveError}</p>
              <Button onClick={onClose} variant="outline">Close</Button>
            </div>
          ) : progress !== undefined && total !== undefined ? (
            /* Regular Generation Progress */
            <div className="w-full max-w-md space-y-6">
              <h3 className="text-lg font-semibold text-center">Generating Individual PDFs</h3>
              <div className="w-full">
                <Progress 
                  value={progress} 
                  max={total} 
                  label={`Creating PDF ${progress} of ${total}`}
                />
              </div>
              <p className="text-sm text-gray-500 text-center">Please wait...</p>
            </div>
          ) : (
            /* Default Loading State */
            <div className="flex flex-col items-center space-y-4">
              <SpinnerInline size="lg" className="text-blue-600" />
              <p className="text-lg">Generating Individual PDFs...</p>
            </div>
          )}
        </div>
      ) : individualPdfsData ? (
        <>
          <h2 className="text-2xl font-bold mb-4">
            Generated {individualPdfsData.length} Individual Certificate{individualPdfsData.length !== 1 ? 's' : ''}
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
                
                // Get email from the detected email column
                const emailAddress = detectedEmailColumn && tableData[index] 
                  ? tableData[index][detectedEmailColumn] || ''
                  : '';

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                    <span className="flex items-center gap-2 flex-1">
                      <Check className="h-4 w-4 text-green-600" />
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">
                          {filename}
                        </span>
                        {hasEmailColumn && emailAddress && (
                          <span className="text-xs text-gray-500">
                            → {emailAddress}
                          </span>
                        )}
                      </div>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        title="Open PDF"
                        onClick={() => {
                          // For blob URLs, open directly in new tab
                          if (file.url.startsWith('blob:')) {
                            window.open(file.url, "_blank");
                          } else {
                            // For server URLs, use the original logic
                            window.open(file.url, "_blank");
                          }
                        }}
                        className="h-8 w-8 p-0">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        title="Download PDF"
                        onClick={() => {
                          // Check if it's a blob URL (client-side generated)
                          if (file.url.startsWith('blob:')) {
                            // For blob URLs, create a download link directly
                            const a = document.createElement('a');
                            a.href = file.url;
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          } else {
                            // For server URLs, use the force-download API
                            const downloadUrl = `/api/force-download?url=${encodeURIComponent(file.url)}&filename=${encodeURIComponent(filename)}`;
                            window.location.href = downloadUrl;
                          }
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
                            !emailAddress
                              ? "No email address available"
                              : !emailConfig.isConfigured
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
                            !emailAddress ||
                            emailSendingStatus[index] === "sending" ||
                            !emailConfig.isConfigured
                          }
                          onClick={() =>
                            sendCertificateEmail(index, file)
                          }
                          className="h-8 w-8 p-0"
                          style={{
                            backgroundColor:
                              !emailAddress
                                ? "transparent"
                                : emailSendingStatus[index] === "sent"
                                  ? "#2D6A4F"
                                  : emailSendingStatus[index] === "error"
                                    ? "#dc2626"
                                    : "transparent",
                            borderColor:
                              !emailAddress
                                ? "#d1d5db"
                                : emailSendingStatus[index] === "sent"
                                  ? "#2D6A4F"
                                  : emailSendingStatus[index] === "error"
                                    ? "#dc2626"
                                    : "#2D6A4F",
                            color:
                              !emailAddress
                                ? "#9ca3af"
                                : emailSendingStatus[index] === "sent"
                                  ? "white"
                                  : emailSendingStatus[index] === "error"
                                    ? "white"
                                    : "#2D6A4F",
                            cursor: !emailAddress ? "not-allowed" : "pointer"
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
              <ActionButton
                onClick={async () => {
                  if (isDownloadingZip) return; // Prevent double-click
                  setIsDownloadingZip(true);
                  try {
                    // Check if we have client-side data (all files have data property)
                    const hasClientData = individualPdfsData.every(file => file.data);
                    
                    if (hasClientData) {
                      // Client-side ZIP creation using JSZip
                      const JSZip = (await import('jszip')).default;
                      const zip = new JSZip();
                      
                      individualPdfsData.forEach((file, index) => {
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

                        // Add file to ZIP using the raw data
                        if (file.data) {
                          zip.file(filename, file.data);
                        }
                      });
                      
                      // Generate and download ZIP
                      const zipBlob = await zip.generateAsync({ type: 'blob' });
                      saveAs(
                        zipBlob,
                        `certificates_${
                          new Date().toISOString().split("T")[0]
                        }.zip`
                      );
                    } else {
                      // Server-side ZIP creation (fallback for server-generated PDFs)
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
                    }
                  } catch (error) {
                    console.error("Error creating ZIP:", error);
                    alert("Failed to create ZIP file. Please try again.");
                  } finally {
                    setIsDownloadingZip(false);
                  }
                }}
                gradient
                gradientType="coral"
                className="flex items-center gap-2"
                disabled={isDownloadingZip}>
                {isDownloadingZip ? (
                  <>
                    <SpinnerInline size="sm" />
                    Creating ZIP...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download All (ZIP)
                  </>
                )}
              </ActionButton>
              {hasEmailColumn && (
                <Button
                  onClick={() => {
                    if (emailConfig.isConfigured) {
                      setShowBulkEmailModal(true);
                    } else {
                      alert("Please configure email settings in the Email tab first.");
                    }
                  }}
                  variant="outline"
                  disabled={!emailConfig.isConfigured}
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
                setShowBulkEmailModal(false);  // Reset bulk email modal state
                onClose();
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
          {/* Bulk Email Modal */}
          {showBulkEmailModal && individualPdfsData && (
            <BulkEmailModal
              open={showBulkEmailModal}
              onClose={() => setShowBulkEmailModal(false)}
              totalEmails={individualPdfsData.length}
              emailConfig={emailConfig}
              certificates={individualPdfsData.map((file, index) => {
                const email = detectedEmailColumn && tableData[index] 
                  ? tableData[index][detectedEmailColumn] || ''
                  : '';
                const baseFilename =
                  tableData[index] && selectedNamingColumn
                    ? tableData[index][selectedNamingColumn] || `Certificate-${index + 1}`
                    : `Certificate-${index + 1}`;
                const sanitizedFilename = baseFilename.replace(/[^a-zA-Z0-9-_]/g, "_");
                
                // Handle duplicates
                const duplicateCount = individualPdfsData
                  .slice(0, index)
                  .filter((_, i) => {
                    const prevBase =
                      tableData[i] && selectedNamingColumn
                        ? tableData[i][selectedNamingColumn] || `Certificate-${i + 1}`
                        : `Certificate-${i + 1}`;
                    return prevBase === baseFilename;
                  }).length;

                const filename =
                  duplicateCount > 0
                    ? `${sanitizedFilename}-${duplicateCount}.pdf`
                    : `${sanitizedFilename}.pdf`;

                return {
                  email,
                  downloadUrl: file.url,
                  fileName: filename
                };
              })}
            />
          )}
        </>
      ) : null}
    </Modal>
  );
}