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
  const percentage = Math.round((value / max) * 100);
  
  return (
    <div className="w-full space-y-2">
      {(label || showPercentage) && (
        <div className="flex justify-between text-sm">
          {label && <span className="text-gray-700">{label}</span>}
          {showPercentage && <span className="text-gray-500">{percentage}%</span>}
        </div>
      )}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-gray-200",
          className
        )}
        {...props}
      >
        <div
          className="h-2 bg-gradient-to-r from-[#2D6A4F] to-[#40916C] transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
