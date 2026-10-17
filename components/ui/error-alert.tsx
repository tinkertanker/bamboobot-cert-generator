import React from "react";
import { AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

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
