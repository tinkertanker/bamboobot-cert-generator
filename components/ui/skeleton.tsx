import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {/* Header */}
      <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="relative w-full h-64 border-4 border-gray-700 rounded-lg overflow-hidden">
      <Skeleton className="absolute inset-0" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-gray-400">
          <svg className="w-12 h-12 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function FormattingPanelSkeleton() {
  return (
    <div className="space-y-6">
      {/* Field selector */}
      <div className="p-3 rounded-lg border">
        <Skeleton className="h-4 w-32" />
      </div>
      
      {/* Controls */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Skeleton className="h-3 w-8 mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div>
          <Skeleton className="h-3 w-10 mb-2" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-8 mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      
      {/* Slider */}
      <Skeleton className="h-2 w-full" />
      
      {/* Color picker */}
      <div>
        <Skeleton className="h-3 w-16 mb-3" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-10" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      
      {/* Alignment */}
      <div>
        <Skeleton className="h-3 w-16 mb-3" />
        <div className="flex gap-1">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </div>
      
      {/* Apply button */}
      <Skeleton className="h-10 w-full" />
      
      {/* Reset buttons */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
    </div>
  );
}