import React from "react";
import { AlertCircle } from "lucide-react";

interface ErrorModalProps {
  open: boolean;
  title: string;
  message: string;
  action?: string;
  onClose?: () => void;
  onRetry?: () => void;
}

export function ErrorModal({
  open,
  title,
  message,
  action,
  onClose,
  onRetry
}: ErrorModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center">
      <div className="relative bg-white w-full max-w-md mx-4 rounded-lg shadow-xl p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <div className="mt-2 text-sm text-gray-500">
              <p>{message}</p>
              {action && (
                <p className="mt-3 font-medium text-gray-700">{action}</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="mt-5 flex justify-end gap-3">
          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                onClose?.();
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {onRetry ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}