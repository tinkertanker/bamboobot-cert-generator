import * as React from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { TOAST } from "@/utils/constants";

export interface ToastProps {
  id: string;
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onClose?: (id: string) => void;
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ id, message, type = "info", duration = TOAST.DEFAULT_DURATION_MS, onClose }, ref) => {
    React.useEffect(() => {
      if (duration > 0) {
        const timer = setTimeout(() => {
          onClose?.(id);
        }, duration);

        return () => clearTimeout(timer);
      }
    }, [id, duration, onClose]);

    const icon = {
      success: <CheckCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />,
      error: <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />,
      info: <Info className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
    }[type];

    const colorClasses = {
      success: "bg-green-50 text-green-800 border-green-200",
      error: "bg-red-50 text-red-800 border-red-200",
      info: "bg-blue-50 text-blue-800 border-blue-200"
    }[type];

    return (
      <div
        ref={ref}
        role={type === "error" ? "alert" : "status"}
        className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg",
          TOAST.ANIMATION,
          colorClasses
        )}
      >
        {icon}
        <p className="text-sm font-medium flex-1 break-words min-w-0">{message}</p>
        <button
          type="button"
          onClick={() => onClose?.(id)}
          className="ml-2 p-1 rounded hover:bg-black/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current flex-shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    );
  }
);

Toast.displayName = "Toast";

// Toast Container Component
export interface ToastContainerProps {
  toasts: ToastProps[];
  onClose: (id: string) => void;
}

export const ToastContainer = React.forwardRef<HTMLDivElement, ToastContainerProps>(
  ({ toasts, onClose }, ref) => {
    return (
      <div
        ref={ref}
        // Above modal overlays (z-50) so feedback triggered from a modal stays visible
        className={cn(
          "fixed z-[60] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-sm",
          TOAST.POSITION
        )}
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onClose={onClose} />
          </div>
        ))}
      </div>
    );
  }
);

ToastContainer.displayName = "ToastContainer";

// Toast Hook
interface ToastItem extends ToastProps {
  id: string;
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const showToast = React.useCallback((toast: Omit<ToastProps, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const hideToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return {
    toasts,
    showToast,
    hideToast
  };
}