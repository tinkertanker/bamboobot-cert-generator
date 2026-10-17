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
        // Fallback accessible name when no visible label or caller-supplied name
        aria-label={
          !label && !props["aria-label"] && !props["aria-labelledby"] ? "Progress" : undefined
        }
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
