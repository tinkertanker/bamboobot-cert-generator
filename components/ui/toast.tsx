import * as React from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export interface ToastProps {
  id: string;
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
  onClose?: (id: string) => void;
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ id, message, type = "info", duration = 3000, onClose }, ref) => {
    React.useEffect(() => {
      if (duration > 0) {
        const timer = setTimeout(() => {
          onClose?.(id);
        }, duration);

        return () => clearTimeout(timer);
      }
    }, [id, duration, onClose]);

    const icon = {
      success: <CheckCircle className="h-4 w-4" />,
      error: <AlertCircle className="h-4 w-4" />,
      info: <Info className="h-4 w-4" />
    }[type];

    const colorClasses = {
      success: "bg-green-50 text-green-800 border-green-200",
      error: "bg-red-50 text-red-800 border-red-200",
      info: "bg-blue-50 text-blue-800 border-blue-200"
    }[type];

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg animate-slide-in",
          colorClasses
        )}
      >
        {icon}
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={() => onClose?.(id)}
          className="ml-2 p-1 rounded hover:bg-black/5 transition-colors"
        >
          <X className="h-3 w-3" />
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
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
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