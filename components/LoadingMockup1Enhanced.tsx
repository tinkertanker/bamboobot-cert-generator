import React from 'react';

export default function LoadingMockup1Enhanced() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAF5' }}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg animate-pulse" style={{ backgroundColor: '#2D6A4F' }} />
            <div className="h-8 w-48 bg-gray-200 rounded-md animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 bg-gray-200 rounded-md animate-pulse inline-flex items-center px-6">
              <span className="w-20 invisible">Generate PDF</span>
            </div>
            <div 
              className="h-10 rounded-md animate-pulse inline-flex items-center px-6" 
              style={{ backgroundColor: '#FFB700', opacity: 0.3 }}
            >
              <span className="w-36 invisible">Generate Individual PDFs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - 60/40 split */}
      <div className="grid grid-cols-[60%_40%] gap-6 p-6" style={{ height: 'calc(100vh - 88px)' }}>
        {/* Left Panel - Certificate Preview */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="h-full flex flex-col">
            {/* Certificate Container */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-full max-w-3xl">
                {/* A4 Aspect Ratio Container */}
                <div className="relative bg-white rounded-lg shadow-lg overflow-hidden" style={{ paddingBottom: '141.42%' }}>
                  <div className="absolute inset-0 p-8">
                    {/* Certificate Border */}
                    <div className="h-full border-4 border-gray-100 rounded-lg p-8 relative overflow-hidden">
                      {/* Shimmer Overlay */}
                      <div className="shimmer-wave" />
                      
                      {/* Certificate Content */}
                      <div className="space-y-6 relative">
                        {/* Logo */}
                        <div className="flex justify-center mb-8">
                          <div className="w-24 h-24 bg-gray-100 rounded-full animate-pulse relative overflow-hidden">
                            <div className="shimmer-wave" />
                          </div>
                        </div>
                        
                        {/* Title */}
                        <div className="space-y-3">
                          <div className="h-8 bg-gray-100 rounded-md mx-auto animate-pulse relative overflow-hidden" style={{ width: '60%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.2s' }} />
                          </div>
                          <div className="h-6 bg-gray-100 rounded-md mx-auto animate-pulse relative overflow-hidden" style={{ width: '40%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.3s' }} />
                          </div>
                        </div>
                        
                        {/* Body Text */}
                        <div className="space-y-4 mt-12">
                          <div className="h-4 bg-gray-100 rounded animate-pulse relative overflow-hidden" style={{ width: '80%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.4s' }} />
                          </div>
                          <div className="h-4 bg-gray-100 rounded animate-pulse relative overflow-hidden" style={{ width: '90%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.5s' }} />
                          </div>
                          <div className="h-4 bg-gray-100 rounded animate-pulse relative overflow-hidden" style={{ width: '70%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.6s' }} />
                          </div>
                        </div>
                        
                        {/* Name Field */}
                        <div className="flex justify-center my-8">
                          <div className="h-10 bg-gray-100 rounded-md animate-pulse relative overflow-hidden" style={{ width: '50%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.7s' }} />
                          </div>
                        </div>
                        
                        {/* Additional Fields */}
                        <div className="space-y-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse mx-auto relative overflow-hidden" style={{ width: '60%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.8s' }} />
                          </div>
                          <div className="h-4 bg-gray-100 rounded animate-pulse mx-auto relative overflow-hidden" style={{ width: '40%' }}>
                            <div className="shimmer-wave" style={{ animationDelay: '0.9s' }} />
                          </div>
                        </div>
                        
                        {/* Signatures */}
                        <div className="flex justify-between mt-16">
                          <div className="text-center">
                            <div className="h-16 w-32 bg-gray-100 rounded animate-pulse mb-2 relative overflow-hidden">
                              <div className="shimmer-wave" style={{ animationDelay: '1s' }} />
                            </div>
                            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse mx-auto" />
                          </div>
                          <div className="text-center">
                            <div className="h-16 w-32 bg-gray-100 rounded animate-pulse mb-2 relative overflow-hidden">
                              <div className="shimmer-wave" style={{ animationDelay: '1.1s' }} />
                            </div>
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
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center">
                <div className="h-9 w-32 bg-gray-200 rounded-md animate-pulse" />
                <div className="flex items-center gap-2">
                  <span className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                  <div className="flex gap-1">
                    <div className="h-8 w-8 bg-gray-200 rounded-md animate-pulse" />
                    <div className="h-8 w-8 bg-gray-200 rounded-md animate-pulse" />
                    <div className="h-8 w-8 bg-gray-200 rounded-md animate-pulse" />
                    <div className="h-8 w-8 bg-gray-200 rounded-md animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Data Panel */}
        <div className="bg-white rounded-lg shadow flex flex-col">
          {/* Tab Navigation */}
          <div className="p-4">
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              <div className="flex-1 py-2 px-4 rounded-md transition-all text-center" style={{ backgroundColor: '#1B4332' }}>
                <div className="h-4 bg-white/30 rounded animate-pulse w-10 mx-auto" />
              </div>
              <div className="flex-1 py-2 px-4 rounded-md transition-all text-center">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-16 mx-auto" />
              </div>
              <div className="flex-1 py-2 px-4 rounded-md transition-all text-center">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-10 mx-auto" />
              </div>
            </div>
          </div>
          
          {/* Table Content */}
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
                {Array.from({ length: 12 }).map((_, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-3 gap-3 py-2">
                    {Array.from({ length: 3 }).map((_, colIndex) => (
                      <div 
                        key={colIndex}
                        className="h-4 bg-gray-100 rounded animate-pulse relative overflow-hidden"
                        style={{ 
                          animationDelay: `${rowIndex * 100 + colIndex * 50}ms`,
                          width: `${60 + Math.random() * 40}%`
                        }}
                      >
                        <div className="shimmer-wave" style={{ animationDelay: `${rowIndex * 0.2}s` }} />
                      </div>
                    ))}
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
        @keyframes shimmerWave {
          0% {
            transform: translateX(-100%) skewX(-12deg);
          }
          100% {
            transform: translateX(200%) skewX(-12deg);
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
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