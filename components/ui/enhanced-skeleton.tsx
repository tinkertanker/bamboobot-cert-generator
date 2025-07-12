import React from 'react';
import { cn } from "@/lib/utils";

interface ShimmerSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
}

export function ShimmerSkeleton({ className, children, ...props }: ShimmerSkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded-md bg-gray-100 relative overflow-hidden", className)} {...props}>
      {children}
      <div className="shimmer-wave" />
      <style jsx>{`
        @keyframes shimmerWave {
          0% {
            transform: translateX(-100%) skewX(-12deg);
          }
          100% {
            transform: translateX(200%) skewX(-12deg);
          }
        }
        .shimmer-wave {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.5),
            transparent
          );
          animation: shimmerWave 2s infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

export function EnhancedTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex gap-4">
          <ShimmerSkeleton className="h-4 w-24" />
          <ShimmerSkeleton className="h-4 w-32" />
          <ShimmerSkeleton className="h-4 w-28" />
        </div>
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-gray-200 last:border-b-0">
          <div className="flex gap-4">
            <ShimmerSkeleton 
              className="h-4" 
              style={{ 
                width: `${60 + Math.random() * 40}%`,
                animationDelay: `${i * 100}ms`
              }} 
            />
            <ShimmerSkeleton 
              className="h-4" 
              style={{ 
                width: `${50 + Math.random() * 50}%`,
                animationDelay: `${i * 100 + 50}ms`
              }} 
            />
            <ShimmerSkeleton 
              className="h-4" 
              style={{ 
                width: `${40 + Math.random() * 60}%`,
                animationDelay: `${i * 100 + 100}ms`
              }} 
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProcessingDataSkeleton() {
  return (
    <div className="flex flex-col space-y-4 p-4">
      <div className="text-center">
        <ShimmerSkeleton className="h-6 w-48 mx-auto mb-2" />
        <div className="text-sm text-gray-500">Processing your data...</div>
      </div>
      <EnhancedTableSkeleton rows={8} />
    </div>
  );
}