import React from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Progress } from '@/components/ui/progress';
import { COLORS } from '@/utils/styles';
import type { PdfGenerationProgress, PdfGenerationResult } from '@/lib/pdf/types';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Pause,
  Play,
  X,
  Download,
  Mail
} from 'lucide-react';

interface ProgressivePdfModalProps {
  open: boolean;
  onClose: () => void;
  progress: PdfGenerationProgress | null;
  results: PdfGenerationResult | null;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onEmailAll?: () => void;
  hasEmailConfig?: boolean;
}

export function ProgressivePdfModal({
  open,
  onClose,
  progress,
  results,
  error,
  onPause,
  onResume,
  onCancel,
  onEmailAll,
  hasEmailConfig
}: ProgressivePdfModalProps) {
  if (!open) return null;

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (): number => {
    if (!progress || progress.total === 0) return 0;
    return Math.round(((progress.processed + progress.failed) / progress.total) * 100);
  };

  const renderContent = () => {
    // Error state
    if (error) {
      return (
        <div className="text-center py-8">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Generation Failed</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button onClick={onClose} variant="outline">Close</Button>
        </div>
      );
    }

    // Results state (completed or partial)
    if (results) {
      return (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {results.status === 'completed' ? 'Generation Complete' : 'Partial Results'}
              </h3>
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">Successful</p>
                <p className="text-2xl font-bold text-green-700">{results.totalProcessed}</p>
              </div>
              {results.totalFailed > 0 && (
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Failed</p>
                  <p className="text-2xl font-bold text-red-700">{results.totalFailed}</p>
                </div>
              )}
            </div>

            {results.errors.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-sm text-gray-700 mb-2">Errors:</h4>
                <div className="max-h-32 overflow-y-auto bg-red-50 p-3 rounded text-sm">
                  {results.errors.map((err, idx) => (
                    <div key={idx} className="text-red-700">
                      Certificate {err.index + 1}: {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {results.files.length > 0 && (
              <>
                <Button
                  onClick={() => {
                    // TODO: Implement ZIP download functionality
                    // This would typically trigger a ZIP download of all generated PDFs
                  }}
                  className="flex-1"
                  style={{ backgroundColor: COLORS.primary, color: 'white' }}>
                  <Download className="h-4 w-4 mr-2" />
                  Download All
                </Button>
                {hasEmailConfig && onEmailAll && (
                  <Button
                    onClick={onEmailAll}
                    variant="outline"
                    className="flex-1">
                    <Mail className="h-4 w-4 mr-2" />
                    Email All
                  </Button>
                )}
              </>
            )}
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      );
    }

    // Progress state
    if (progress) {
      const percentage = getProgressPercentage();
      const isPaused = progress.status === 'paused';
      const isProcessing = progress.status === 'processing';

      return (
        <div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Generating Certificates</h3>
              <span className="text-sm text-gray-500">
                {progress.processed + progress.failed} of {progress.total}
              </span>
            </div>

            <Progress
              value={percentage}
              max={100}
              label={`${percentage}%`}
              showPercentage
              className="mb-4"
            />

            <div className="space-y-2 text-sm">
              {progress.currentItem && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Current:</span>
                  <span className="font-medium truncate">{progress.currentItem}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-gray-600">Batch:</span>
                <span className="font-medium">
                  {progress.currentBatch} of {progress.totalBatches}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Time:</span>
                <span className="font-medium">
                  {formatTime(progress.timeElapsed)}
                  {progress.estimatedTimeRemaining && (
                    <span className="text-gray-500">
                      {' '}/ ~{formatTime(progress.estimatedTimeRemaining)} remaining
                    </span>
                  )}
                </span>
              </div>

              <div className="flex gap-4 pt-2">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-green-700">{progress.processed} completed</span>
                </div>
                {progress.failed > 0 && (
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-700">{progress.failed} failed</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {isProcessing && (
              <Button
                onClick={onPause}
                variant="outline"
                className="flex-1">
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            {isPaused && (
              <Button
                onClick={onResume}
                className="flex-1"
                style={{ backgroundColor: COLORS.primary, color: 'white' }}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1">
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      );
    }

    // Loading state
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-12 w-12 border-4 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Starting PDF generation...</p>
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdropClick={false}
      width="w-full max-w-md">
      {renderContent()}
    </Modal>
  );
}