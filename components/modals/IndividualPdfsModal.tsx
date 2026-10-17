import React, { useState, useEffect, useMemo, useId } from "react";
import { FixedSizeList as List } from 'react-window';
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import SpinnerInline from "@/components/SpinnerInline";
import { BulkEmailModal } from "./BulkEmailModal";
import { saveAs } from "file-saver";
import type { IndividualPdfsModalProps } from "@/types/certificate";
import { UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';
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
  const [zipError, setZipError] = useState<string | null>(null);
  const namingSelectId = useId();
  const emailHintId = useId();
  const displayFilenames = useMemo(() => {
    if (!individualPdfsData) return [];
    const allocator = new UniquePdfFilenameAllocator();
    return individualPdfsData.map((file, index) => {
      const rowIndex = file.originalIndex ?? index;
      const baseFilename =
        tableData[rowIndex] && selectedNamingColumn
          ? tableData[rowIndex][selectedNamingColumn] ||
            `Certificate-${rowIndex + 1}`
          : `Certificate-${rowIndex + 1}`;
      return allocator.allocate(baseFilename);
    });
  }, [individualPdfsData, selectedNamingColumn, tableData]);

  const renderFileRow = ({
    index,
    style
  }: {
    index: number;
    style?: React.CSSProperties;
  }) => {
    if (!individualPdfsData) return null;
    const file = individualPdfsData[index];
    const filename = displayFilenames[index];
    const rowIndex = file.originalIndex ?? index;
    const emailAddress =
      detectedEmailColumn && tableData[rowIndex]
        ? tableData[rowIndex][detectedEmailColumn] || ''
        : '';
    const sendStatus = emailSendingStatus[rowIndex];
    const canEmail = !!emailAddress && emailConfig.isConfigured;
    const emailTitle = !emailAddress
      ? 'No email address available'
      : !emailConfig.isConfigured
        ? 'Configure email settings in Email tab first'
        : sendStatus === 'sending'
          ? 'Sending email...'
          : sendStatus === 'sent'
            ? 'Email sent!'
            : sendStatus === 'error'
              ? 'Failed to send email'
              : 'Send via email';

    return (
      <div key={index} style={style} className={style ? 'pb-2' : undefined}>
        <div className="flex h-full items-center justify-between p-2 bg-white rounded border border-gray-200">
          <span className="flex items-center gap-2 flex-1 min-w-0">
            <Check className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
            <div className="flex flex-col min-w-0">
              <span className="font-mono text-sm truncate">{filename}</span>
              {hasEmailColumn && emailAddress && (
                <span className="text-xs text-gray-500 truncate">
                  <span aria-hidden="true">→ </span>{emailAddress}
                </span>
              )}
            </div>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              title="Open PDF"
              aria-label={`Open ${filename}`}
              onClick={() => window.open(file.url, '_blank')}
              className="h-8 w-8 p-0">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Download PDF"
              aria-label={`Download ${filename}`}
              onClick={() => {
                if (file.url.startsWith('blob:')) {
                  const anchor = document.createElement('a');
                  anchor.href = file.url;
                  anchor.download = filename;
                  document.body.appendChild(anchor);
                  anchor.click();
                  document.body.removeChild(anchor);
                } else {
                  window.location.href = `/api/force-download?url=${encodeURIComponent(file.url)}&filename=${encodeURIComponent(filename)}`;
                }
              }}
              className="h-8 w-8 p-0">
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            {hasEmailColumn && (
              <Button
                size="sm"
                variant="outline"
                title={emailTitle}
                aria-label={`${emailTitle}: ${filename}`}
                disabled={!canEmail || sendStatus === 'sending'}
                onClick={() =>
                  sendCertificateEmail(index, { ...file, filename })
                }
                className="h-8 w-8 p-0"
                style={
                  !canEmail
                    ? { borderColor: '#d1d5db', color: '#9ca3af', backgroundColor: 'transparent' }
                    : sendStatus === 'sent'
                      ? { borderColor: '#2D6A4F', color: 'white', backgroundColor: '#2D6A4F' }
                      : sendStatus === 'error'
                        ? { borderColor: '#dc2626', color: 'white', backgroundColor: '#dc2626' }
                        : { borderColor: '#2D6A4F', color: '#2D6A4F', backgroundColor: 'transparent' }
                }>
                {sendStatus === 'sending' ? (
                  <div
                    className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                ) : sendStatus === 'sent' ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : sendStatus === 'error' ? (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Mail className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  // Reset bulk email modal state when the modal opens
  useEffect(() => {
    if (individualPdfsData) {
      setShowBulkEmailModal(false);
    }
  }, [individualPdfsData]);

  const canClose = !isGeneratingIndividual;

  const handleClose = () => {
    if (!canClose) return;
    setIndividualPdfsData(null);
    setSelectedNamingColumn("");
    setShowBulkEmailModal(false);
    setZipError(null);
    onClose();
  };

  const handleDownloadZip = async () => {
    if (!individualPdfsData || isDownloadingZip) return; // Prevent double-click
    setIsDownloadingZip(true);
    setZipError(null);
    try {
      const zipFilename = `certificates_${new Date().toISOString().split("T")[0]}.zip`;
      const hasClientData = individualPdfsData.every((file) => file.blob);

      if (hasClientData) {
        // Client-side ZIP creation using JSZip
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        individualPdfsData.forEach((file, index) => {
          // Add the canonical Blob without retaining a byte-array copy.
          zip.file(displayFilenames[index], file.blob!);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, zipFilename);
      } else {
        // Server-side ZIP creation (fallback for server-generated PDFs)
        const fileList = individualPdfsData.map((file, index) => ({
          url: file.url,
          filename: displayFilenames[index]
        }));

        const response = await fetch("/api/zip-pdfs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: fileList })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("ZIP API Error:", errorText);
          throw new Error(`Failed to create ZIP: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        saveAs(blob, zipFilename);
      }
    } catch (error) {
      console.error("Error creating ZIP:", error);
      setZipError(
        "We couldn't create the ZIP file. Try again, or download the certificates individually."
      );
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const progressErrors = progressiveProgress?.errors ?? [];
  const hasFailedCard = !!progressiveProgress && progressiveProgress.failed > 0;

  const renderErrorList = (errors: Array<{ index: number; error: string }>) => (
    <div className="max-w-2xl mx-auto w-full">
      <h3 className="font-medium text-sm text-gray-700 mb-2">Errors</h3>
      <ul className="max-h-32 overflow-y-auto bg-red-50 p-3 rounded text-sm space-y-1">
        {errors.map((err, idx) => (
          <li key={idx} className="text-red-700">
            Entry {err.index + 1}: {err.error}
          </li>
        ))}
      </ul>
    </div>
  );

  const renderGenerating = () => {
    if (isProgressiveMode && progressiveProgress) {
      return (
        <div className="w-full space-y-6">
          <h2 className="text-2xl font-bold text-center text-gray-900">
            Generating Individual PDFs
          </h2>

          {/* Progress Bar */}
          <div className="w-full max-w-2xl mx-auto">
            <Progress
              value={progressiveProgress.processed}
              max={progressiveProgress.total}
              label={`${progressiveProgress.processed} of ${progressiveProgress.total} processed${
                progressiveProgress.status === 'paused' ? ' (paused)' : ''
              }`}
              className="h-3"
            />
          </div>

          {/* Stats Grid */}
          <div
            className={`grid gap-3 sm:gap-4 max-w-2xl mx-auto ${
              hasFailedCard ? 'grid-cols-3' : 'grid-cols-2'
            }`}>
            <div className="bg-green-50 p-3 sm:p-4 rounded-lg text-center">
              <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" aria-hidden="true" />
              <p className="text-2xl font-bold text-green-700">{progressiveProgress.processed}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
            {hasFailedCard && (
              <div className="bg-red-50 p-3 sm:p-4 rounded-lg text-center">
                <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" aria-hidden="true" />
                <p className="text-2xl font-bold text-red-700">{progressiveProgress.failed}</p>
                <p className="text-sm text-gray-600">Failed</p>
              </div>
            )}
            <div className="bg-blue-50 p-3 sm:p-4 rounded-lg text-center">
              <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2" aria-hidden="true" />
              <p className="text-2xl font-bold text-blue-700">
                {progressiveProgress.status === 'paused'
                  ? 'Paused'
                  : progressiveProgress.estimatedTimeRemaining
                    ? formatDuration(progressiveProgress.estimatedTimeRemaining)
                    : '…'}
              </p>
              <p className="text-sm text-gray-600">Time remaining</p>
            </div>
          </div>

          {/* Current Item */}
          {progressiveProgress.currentItem && (
            <div className="text-center" aria-live="polite">
              <p className="text-sm text-gray-500">Currently processing:</p>
              <p className="font-medium text-gray-900 break-words">{progressiveProgress.currentItem}</p>
            </div>
          )}

          {/* Non-fatal errors (e.g. pause/resume failed) */}
          {progressiveError && (
            <p role="alert" className="text-sm text-center text-red-700">
              {progressiveError}
            </p>
          )}

          {/* Control Buttons */}
          <div className="flex flex-wrap justify-center gap-3">
            {progressiveProgress.status === 'processing' ? (
              <Button
                onClick={onProgressivePause}
                variant="outline"
                className="flex items-center gap-2">
                <Pause className="h-4 w-4" aria-hidden="true" />
                Pause
              </Button>
            ) : progressiveProgress.status === 'paused' ? (
              <Button
                onClick={onProgressiveResume}
                variant="outline"
                className="flex items-center gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                Resume
              </Button>
            ) : null}
            <Button
              onClick={onProgressiveCancel}
              variant="outline"
              className="text-red-600 hover:text-red-700 flex items-center gap-2">
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>

          {progressErrors.length > 0 && renderErrorList(progressErrors)}
        </div>
      );
    }

    if (progress !== undefined && total !== undefined) {
      return (
        <div className="w-full max-w-md mx-auto space-y-6">
          <h2 className="text-lg font-semibold text-center text-gray-900">
            Generating Individual PDFs
          </h2>
          <Progress
            value={progress}
            max={total}
            label={`Creating PDF ${progress} of ${total}`}
          />
          <p className="text-sm text-gray-500 text-center">Please wait…</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center space-y-4 py-8">
        <SpinnerInline size="lg" className="text-[#2D6A4F]" />
        <h2 className="text-lg text-gray-900">
          {isProgressiveMode ? 'Starting PDF generation…' : 'Generating Individual PDFs…'}
        </h2>
        <p className="text-sm text-gray-500">
          This may take a moment for large datasets.
        </p>
      </div>
    );
  };

  // Generation stopped without producing files: failed, or cancelled by the user
  const renderStopped = () => {
    const failed = !!progressiveError || progressiveProgress?.status === 'error';
    return (
      <div className="text-center py-6 space-y-4">
        {failed ? (
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto" aria-hidden="true" />
        ) : (
          <X className="h-16 w-16 text-gray-400 mx-auto" aria-hidden="true" />
        )}
        <h2 className="text-lg font-semibold text-gray-900">
          {failed ? 'Generation Failed' : 'Generation Cancelled'}
        </h2>
        <p className="text-gray-600 max-w-md mx-auto">
          {failed
            ? progressiveError && progressiveError !== 'PDF generation failed'
              ? progressiveError
              : 'Something went wrong while creating your certificates. Check your template and data, then try again.'
            : progressiveProgress
              ? `Stopped after ${progressiveProgress.processed} of ${progressiveProgress.total} certificates.`
              : 'PDF generation was stopped.'}
        </p>
        {progressErrors.length > 0 && renderErrorList(progressErrors)}
        <Button onClick={handleClose} variant="outline">
          Close
        </Button>
      </div>
    );
  };

  const isOpen =
    isGeneratingIndividual ||
    !!individualPdfsData ||
    (isProgressiveMode && !!progressiveProgress) ||
    !!progressiveError;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      closeOnBackdropClick={canClose}
      closeOnEscape={canClose}
      width="w-full max-w-6xl">
      {isGeneratingIndividual ? (
        <div className="flex flex-col items-center justify-center" aria-busy="true">
          {renderGenerating()}
        </div>
      ) : individualPdfsData ? (
        <>
          <h2 className="text-2xl font-bold mb-4 text-gray-900">
            Generated {individualPdfsData.length} Individual Certificate{individualPdfsData.length !== 1 ? 's' : ''}
          </h2>

          {progressErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {progressErrors.length} certificate{progressErrors.length !== 1 ? 's' : ''} could not be generated:
              <ul className="mt-1 max-h-24 overflow-y-auto list-disc pl-5">
                {progressErrors.map((err, idx) => (
                  <li key={idx}>Entry {err.index + 1}: {err.error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* File Naming Controls */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-2 sm:gap-4">
              <label htmlFor={namingSelectId} className="font-medium text-gray-900 sm:col-span-4">
                Use this field for download filename:
              </label>
              <div className="sm:col-span-8">
                <Select
                  id={namingSelectId}
                  value={selectedNamingColumn}
                  onChange={(e) =>
                    setSelectedNamingColumn(e.target.value)
                  }
                  className="text-sm w-full">
                  {tableData.length > 0 &&
                    Object.keys(tableData[0]).map((column) => (
                      <option key={column} value={column}>
                        {column || '(blank header)'}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          </div>

          {/* Files List */}
          <div
            className={`bg-gray-100 p-4 rounded-lg mb-4 ${
              individualPdfsData.length > 100
                ? ''
                : 'max-h-96 overflow-y-auto'
            }`}>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" aria-hidden="true" />
              <h3 className="font-medium text-gray-900">Files ready</h3>
            </div>
            {individualPdfsData.length > 100 ? (
              <List
                height={Math.min(384, individualPdfsData.length * 64)}
                itemCount={individualPdfsData.length}
                itemSize={64}
                width="100%">
                {renderFileRow}
              </List>
            ) : (
              <div className="space-y-2">
                {individualPdfsData.map((_, index) =>
                  renderFileRow({ index })
                )}
              </div>
            )}
          </div>

          {zipError && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>{zipError}</span>
              <Button size="sm" variant="outline" onClick={handleDownloadZip}>
                Try again
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  onClick={handleDownloadZip}
                  gradient
                  gradientType="coral"
                  className="flex items-center gap-2"
                  aria-busy={isDownloadingZip}
                  disabled={isDownloadingZip}>
                  {isDownloadingZip ? (
                    <>
                      <SpinnerInline size="sm" />
                      Creating ZIP…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Download All (ZIP)
                    </>
                  )}
                </ActionButton>
                {hasEmailColumn && (
                  <Button
                    onClick={() => setShowBulkEmailModal(true)}
                    variant="outline"
                    disabled={!emailConfig.isConfigured}
                    aria-describedby={!emailConfig.isConfigured ? emailHintId : undefined}
                    className="flex items-center gap-2">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Email All
                  </Button>
                )}
              </div>
              {hasEmailColumn && !emailConfig.isConfigured && (
                <p id={emailHintId} className="text-xs text-gray-500">
                  To email certificates, close this window and set up the Email tab first.
                </p>
              )}
            </div>
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex items-center gap-2 border-gray-500 text-gray-600 hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" aria-hidden="true" />
              Close
            </Button>
          </div>
          {/* Bulk Email Modal */}
          {showBulkEmailModal && (
            <BulkEmailModal
              open={showBulkEmailModal}
              onClose={() => setShowBulkEmailModal(false)}
              totalEmails={individualPdfsData.length}
              emailConfig={emailConfig}
              certificates={individualPdfsData.map((file, index) => {
                const rowIndex = file.originalIndex ?? index;
                const email = detectedEmailColumn && tableData[rowIndex]
                  ? tableData[rowIndex][detectedEmailColumn] || ''
                  : '';

                return {
                  email,
                  downloadUrl: file.url,
                  fileName: displayFilenames[index],
                  blob: file.blob
                };
              })}
            />
          )}
        </>
      ) : (
        renderStopped()
      )}
    </Modal>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
