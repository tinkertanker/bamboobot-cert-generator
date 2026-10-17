import React from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import SpinnerInline from "@/components/SpinnerInline";
import { COLORS } from "@/utils/styles";
import { Download, X } from "lucide-react";
import type { PdfGenerationModalProps } from "@/types/certificate";

export function PdfGenerationModal({
  isGenerating,
  generatedPdfUrl,
  handleDownloadPdf,
  setGeneratedPdfUrl,
  onClose,
  progress,
  total
}: PdfGenerationModalProps & { progress?: number; total?: number }) {
  const open = isGenerating || !!generatedPdfUrl;

  const handleClose = () => {
    if (isGenerating) return;
    setGeneratedPdfUrl(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnBackdropClick={!isGenerating}
      closeOnEscape={!isGenerating}
      ariaLabel={isGenerating ? "Generating PDF" : undefined}
      width={isGenerating ? "w-full max-w-md" : "w-full max-w-6xl"}>
      {isGenerating ? (
        <div
          className="flex flex-col items-center justify-center min-h-[12rem]"
          aria-live="polite"
          aria-busy="true">
          {progress !== undefined && total !== undefined ? (
            <div className="w-full space-y-6">
              <h2 className="text-lg font-semibold text-center text-gray-900">
                Generating Certificates
              </h2>
              <Progress
                value={progress}
                max={total}
                label={`Processing certificate ${progress} of ${total}`}
              />
              <p className="text-sm text-gray-500 text-center">Please wait…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <SpinnerInline size="lg" className="text-[#2D6A4F]" />
              <p className="text-lg text-gray-900">Generating PDF…</p>
              <p className="text-sm text-gray-500">
                This may take a moment for large datasets.
              </p>
            </div>
          )}
        </div>
      ) : generatedPdfUrl ? (
        <>
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: COLORS.textPrimary }}>
            PDF Generated
          </h2>
          <div className="bg-gray-100 p-2 rounded-lg mb-4">
            <iframe
              src={generatedPdfUrl}
              title="Generated PDF preview"
              className="block w-full h-[60vh] min-h-[320px] border-0 rounded bg-white"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <ActionButton
              onClick={handleDownloadPdf}
              gradient
              gradientType="coral"
              className="flex items-center gap-2">
              <Download className="h-4 w-4" aria-hidden="true" />
              Download PDF
            </ActionButton>
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex items-center gap-2 border-gray-500 text-gray-600 hover:bg-gray-100 hover:text-gray-700">
              <X className="h-4 w-4" aria-hidden="true" />
              Close
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
