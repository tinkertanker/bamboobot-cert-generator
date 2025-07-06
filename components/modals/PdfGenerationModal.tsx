import React from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import Spinner from "@/components/Spinner";
import type { PdfGenerationModalProps } from "@/types/certificate";

export function PdfGenerationModal({
  isGenerating,
  generatedPdfUrl,
  handleDownloadPdf,
  setGeneratedPdfUrl,
  onClose
}: PdfGenerationModalProps) {
  if (!isGenerating && !generatedPdfUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center"
      onClick={() => !isGenerating && onClose()}>
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
              <ActionButton
                onClick={handleDownloadPdf}
                gradient
                gradientType="coral">
                Download PDF
              </ActionButton>
              <Button
                onClick={() => {
                  setGeneratedPdfUrl(null);
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
                }}>
                Close
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}