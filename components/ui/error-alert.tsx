import React from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";

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
                type="button"
                onClick={onRetry}
                className="text-sm font-medium text-red-800 hover:text-red-900 underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              >
                Try again
              </button>
            </div>
          )}
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <button
              type="button"
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
  const titleId = React.useId();
  const descriptionId = React.useId();
  const primaryButtonRef = React.useRef<HTMLButtonElement>(null);
  const handleClose = React.useCallback(() => onClose?.(), [onClose]);

  // Shared Modal provides Escape/backdrop close, focus trap and focus restore.
  return (
    <Modal
      open={open}
      onClose={handleClose}
      width="w-full max-w-md"
      className="mx-4"
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      initialFocusRef={primaryButtonRef}
    >
      <div role="alert" className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1">
          <h3 id={titleId} className="text-lg font-medium text-gray-900">{title}</h3>
          <div id={descriptionId} className="mt-2 text-sm text-gray-600">
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
            type="button"
            ref={primaryButtonRef}
            onClick={() => {
              onRetry();
              onClose?.();
            }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            Try Again
          </button>
        )}
        <button
          type="button"
          ref={onRetry ? undefined : primaryButtonRef}
          onClick={handleClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
        >
          {onRetry ? "Cancel" : "Close"}
        </button>
      </div>
    </Modal>
  );
}
