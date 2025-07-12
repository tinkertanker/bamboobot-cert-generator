import React from 'react';

const LoadingMockup2: React.FC = () => {
  return (
    <>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-12px);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          0% {
            transform: translateX(-10px);
            opacity: 0;
          }
          100% {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #F8FAF5;
          border-top: 4px solid #2D6A4F;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid #F8FAF5;
          border-top: 2px solid #2D6A4F;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .dot {
          width: 8px;
          height: 8px;
          background-color: #2D6A4F;
          border-radius: 50%;
          display: inline-block;
          margin: 0 3px;
        }

        .dot:nth-child(1) {
          animation: bounce 1.4s infinite ease-in-out both;
          animation-delay: -0.32s;
        }

        .dot:nth-child(2) {
          animation: bounce 1.4s infinite ease-in-out both;
          animation-delay: -0.16s;
        }

        .dot:nth-child(3) {
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .pulse-bg {
          animation: pulse 2s ease-in-out infinite;
        }

        .slide-in {
          animation: slideIn 0.5s ease-out forwards;
        }

        .shimmer {
          background: linear-gradient(
            90deg,
            #F8FAF5 0%,
            #E8EDE5 50%,
            #F8FAF5 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>

      <div className="min-h-screen bg-[#F8FAF5] p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-[#1B4332] mb-2">Certificate Generator</h1>
            <p className="text-[#6B7280]">Loading your workspace...</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Certificate Preview Area - Left Side */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1B4332]">Certificate Preview</h2>
                <div className="flex gap-2">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
              
              {/* Preview Loading Area */}
              <div className="aspect-[1.414/1] bg-[#F8FAF5] rounded-lg flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 shimmer opacity-30"></div>
                <div className="relative z-10">
                  <div className="spinner"></div>
                  <p className="text-[#6B7280] mt-4 text-sm text-center">Loading template...</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex gap-3">
                <button className="flex-1 bg-[#2D6A4F] text-white py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2 opacity-75">
                  <div className="spinner-small"></div>
                  Generate PDF
                </button>
                <button className="flex-1 bg-[#FFB700] text-[#1B4332] py-2 px-4 rounded-lg font-medium flex items-center justify-center gap-2 opacity-75">
                  <div className="spinner-small"></div>
                  Send Email
                </button>
              </div>
            </div>

            {/* Data Panel - Right Side */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-[#1B4332]">Certificate Data</h2>
                <div className="bg-[#F8FAF5] px-3 py-1 rounded-full">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#6B7280]">Loading</span>
                    <div className="flex">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Table Loading State */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-[#F8FAF5] p-3 border-b border-gray-200">
                  <div className="flex gap-4">
                    <div className="h-4 bg-gray-200 rounded w-24 pulse-bg"></div>
                    <div className="h-4 bg-gray-200 rounded w-32 pulse-bg"></div>
                    <div className="h-4 bg-gray-200 rounded w-28 pulse-bg"></div>
                  </div>
                </div>
                
                {/* Table Rows */}
                {[...Array(6)].map((_, index) => (
                  <div 
                    key={index} 
                    className="p-3 border-b border-gray-100 slide-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex gap-4">
                      <div className="h-4 bg-gray-100 rounded w-20 shimmer"></div>
                      <div className="h-4 bg-gray-100 rounded w-36 shimmer" style={{ animationDelay: '0.2s' }}></div>
                      <div className="h-4 bg-gray-100 rounded w-24 shimmer" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Entry Navigation */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <button className="p-2 bg-[#F8FAF5] rounded-lg text-[#6B7280] opacity-50">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button className="p-2 bg-[#F8FAF5] rounded-lg text-[#6B7280] opacity-50">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="text-sm text-[#6B7280] flex items-center gap-2">
                  <span>Entry</span>
                  <div className="h-4 bg-gray-200 rounded w-8 pulse-bg"></div>
                  <span>of</span>
                  <div className="h-4 bg-gray-200 rounded w-8 pulse-bg"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="mt-6 bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <button className="bg-[#F8FAF5] text-[#6B7280] py-2 px-4 rounded-lg font-medium flex items-center gap-2">
                  <div className="spinner-small"></div>
                  Import Data
                </button>
                <button className="bg-[#F8FAF5] text-[#6B7280] py-2 px-4 rounded-lg font-medium opacity-50">
                  Clear All
                </button>
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-sm text-[#6B7280]">Auto-saving...</span>
                <div className="flex">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoadingMockup2;