import React from 'react';

const LoadingMockup1: React.FC = () => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAF5' }}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg animate-pulse" style={{ backgroundColor: '#2D6A4F' }} />
            <div className="h-8 w-48 bg-gray-200 rounded-md animate-pulse" />
          </div>
          <div className="flex space-x-3">
            <div className="h-10 w-32 bg-gray-200 rounded-md animate-pulse" />
            <div className="h-10 w-32 rounded-md animate-pulse" style={{ backgroundColor: '#FFB700', opacity: 0.3 }} />
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-88px)]">
        {/* Left Panel - Certificate Preview */}
        <div className="flex-1 p-6">
          <div className="h-full flex flex-col">
            {/* Certificate Loading Skeleton */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-full max-w-3xl">
                {/* A4 Aspect Ratio Container */}
                <div className="relative bg-white rounded-lg shadow-lg overflow-hidden" style={{ paddingBottom: '141.42%' }}>
                  <div className="absolute inset-0 p-8">
                    {/* Certificate Border Skeleton */}
                    <div className="h-full border-4 border-gray-100 rounded-lg p-8 relative overflow-hidden">
                      {/* Shimmer Effect */}
                      <div className="absolute inset-0 -translate-x-full animate-shimmer">
                        <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                      </div>
                      
                      {/* Certificate Content Skeleton */}
                      <div className="space-y-6">
                        {/* Logo Placeholder */}
                        <div className="flex justify-center mb-8">
                          <div className="w-24 h-24 bg-gray-100 rounded-full animate-pulse" />
                        </div>
                        
                        {/* Title Lines */}
                        <div className="space-y-3">
                          <div className="h-8 bg-gray-100 rounded-md mx-auto animate-pulse" style={{ width: '60%' }} />
                          <div className="h-6 bg-gray-100 rounded-md mx-auto animate-pulse" style={{ width: '40%' }} />
                        </div>
                        
                        {/* Certificate Body */}
                        <div className="space-y-4 mt-12">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '80%' }} />
                          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '90%' }} />
                          <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: '70%' }} />
                        </div>
                        
                        {/* Name Field */}
                        <div className="flex justify-center my-8">
                          <div className="h-10 bg-gray-100 rounded-md animate-pulse" style={{ width: '50%' }} />
                        </div>
                        
                        {/* Additional Lines */}
                        <div className="space-y-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse mx-auto" style={{ width: '60%' }} />
                          <div className="h-4 bg-gray-100 rounded animate-pulse mx-auto" style={{ width: '40%' }} />
                        </div>
                        
                        {/* Signature Section */}
                        <div className="flex justify-between mt-16">
                          <div className="text-center">
                            <div className="h-16 w-32 bg-gray-100 rounded animate-pulse mb-2" />
                            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mx-auto" />
                          </div>
                          <div className="text-center">
                            <div className="h-16 w-32 bg-gray-100 rounded animate-pulse mb-2" />
                            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mx-auto" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="mt-4 flex justify-center space-x-3">
              <div className="h-10 w-10 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-10 w-10 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-10 w-32 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-10 w-10 bg-gray-200 rounded-md animate-pulse" />
              <div className="h-10 w-10 bg-gray-200 rounded-md animate-pulse" />
            </div>
          </div>
        </div>

        {/* Right Panel - Data Table */}
        <div className="w-96 border-l border-gray-200 flex flex-col">
          {/* Tab Headers */}
          <div className="flex border-b border-gray-200">
            <div className="flex-1 p-4 border-b-2" style={{ borderColor: '#1B4332' }}>
              <div className="h-5 bg-gray-200 rounded animate-pulse w-20 mx-auto" />
            </div>
            <div className="flex-1 p-4">
              <div className="h-5 bg-gray-100 rounded animate-pulse w-24 mx-auto" />
            </div>
            <div className="flex-1 p-4">
              <div className="h-5 bg-gray-100 rounded animate-pulse w-20 mx-auto" />
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-hidden">
            <div className="p-4">
              {/* Table Header */}
              <div className="grid grid-cols-3 gap-3 pb-3 border-b border-gray-200">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
              </div>

              {/* Table Rows */}
              <div className="space-y-2 mt-3">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 py-2">
                    <div 
                      className="h-4 bg-gray-100 rounded animate-pulse" 
                      style={{ 
                        animationDelay: `${i * 100}ms`,
                        width: `${80 + Math.random() * 20}%` 
                      }} 
                    />
                    <div 
                      className="h-4 bg-gray-100 rounded animate-pulse" 
                      style={{ 
                        animationDelay: `${i * 100 + 50}ms`,
                        width: `${70 + Math.random() * 30}%` 
                      }} 
                    />
                    <div 
                      className="h-4 bg-gray-100 rounded animate-pulse" 
                      style={{ 
                        animationDelay: `${i * 100 + 100}ms`,
                        width: `${60 + Math.random() * 40}%` 
                      }} 
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: '#1B4332', opacity: 0.2 }} />
            <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: '#2D6A4F', opacity: 0.2 }} />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
};

export default LoadingMockup1;