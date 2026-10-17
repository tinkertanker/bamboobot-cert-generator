import React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
}

export function Progress({ 
  value, 
  max = 100, 
  label, 
  showPercentage = true,
  className,
  ...props 
}: ProgressProps) {
  const safeMax = max > 0 ? max : 0;
  const clampedValue = Math.min(Math.max(value || 0, 0), safeMax);
  const percentage = safeMax > 0 ? Math.round((clampedValue / safeMax) * 100) : 0;
  const labelId = React.useId();
  
  return (
    <div className="w-full space-y-2">
      {(label || showPercentage) && (
        <div className="flex justify-between gap-3 text-sm">
          {label && <span id={labelId} className="text-gray-700">{label}</span>}
          {showPercentage && (
            <span className="text-gray-500 tabular-nums" aria-hidden="true">
              {percentage}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-labelledby={label ? labelId : undefined}
        className={cn(
          "relative h-2 w-full overflow-hidden rounded-full bg-gray-200",
          className
        )}
        {...props}
      >
        <div
          className="h-full bg-gradient-to-r from-[#2D6A4F] to-[#40916C] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

interface ProgressModalProps {
  open: boolean;
  progress: number;
  total: number;
  title?: string;
  description?: string;
  onCancel?: () => void;
}

export function ProgressModal({
  open,
  progress,
  total,
  title = "Processing...",
  description,
  onCancel
}: ProgressModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center">
      <div className="relative bg-white w-full max-w-md mx-4 rounded-lg shadow-xl p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        {description && (
          <p className="text-gray-600 mb-4">{description}</p>
        )}
        
        <div className="mb-4">
          <Progress 
            value={progress} 
            max={total} 
            label={`Processing ${progress} of ${total}`}
          />
        </div>

        {onCancel && (
          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}