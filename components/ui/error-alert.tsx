import React from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorAlertProps {
  title: string;
  message: string;
  action?: string;
  onClose?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function ErrorAlert({
  title,
  message,
  action,
  onClose,
  onRetry,
  className
}: ErrorAlertProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-red-200 bg-red-50 p-4",
        className
      )}
      role="alert"
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">{title}</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{message}</p>
            {action && (
              <p className="mt-2 font-medium">{action}</p>
            )}
          </div>
          {onRetry && (
            <div className="mt-3">
              <button
                onClick={onRetry}
                className="text-sm font-medium text-red-800 hover:text-red-900 underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-red-50"
            >
              <span className="sr-only">Dismiss</span>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ErrorModalProps extends ErrorAlertProps {
  open: boolean;
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