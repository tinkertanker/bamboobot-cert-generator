import React from 'react';

const LoadingMockup3: React.FC = () => {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAF5' }}>
      <style jsx>{`
        @keyframes shimmerWave {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes shimmerPulse {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(255, 183, 0, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(255, 183, 0, 0.5);
          }
        }

        @keyframes waveMove {
          0% {
            transform: translateX(-100%) skewX(-20deg);
          }
          100% {
            transform: translateX(200%) skewX(-20deg);
          }
        }

        .shimmer-base {
          position: relative;
          overflow: hidden;
          background: linear-gradient(
            90deg,
            #e8ebe6 0%,
            #f2f4f0 50%,
            #e8ebe6 100%
          );
        }

        .shimmer-wave {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 20%,
            rgba(255, 255, 255, 0.5) 50%,
            rgba(255, 255, 255, 0.3) 80%,
            transparent 100%
          );
          animation: shimmerWave 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .shimmer-glow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            105deg,
            transparent 40%,
            rgba(255, 183, 0, 0.1) 50%,
            transparent 60%
          );
          animation: waveMove 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .shimmer-subtle {
          background: linear-gradient(
            90deg,
            #e8ebe6 0%,
            #eef0ec 50%,
            #e8ebe6 100%
          );
          animation: shimmerPulse 2s ease-in-out infinite;
        }

        .button-glow {
          animation: glowPulse 2s ease-in-out infinite;
        }

        @keyframes fadeIn {
          to {
            opacity: 1;
          }
        }
      `}</style>

      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="shimmer-base h-10 w-48 rounded-lg">
            <div className="shimmer-wave" />
          </div>
          <div className="flex gap-3">
            <div className="shimmer-base h-10 w-32 rounded-lg button-glow">
              <div className="shimmer-wave" />
            </div>
            <div className="shimmer-base h-10 w-32 rounded-lg">
              <div className="shimmer-wave" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-6 px-6">
        {/* Certificate Preview Area */}
        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-lg p-8">
            {/* Certificate Canvas */}
            <div className="shimmer-base rounded-lg aspect-[1.414/1] relative">
              <div className="shimmer-wave" />
              <div className="shimmer-glow" />
              
              {/* Certificate Elements */}
              <div className="absolute inset-0 p-12 flex flex-col items-center justify-center">
                {/* Header decoration */}
                <div className="shimmer-subtle h-2 w-64 rounded-full mb-8" />
                
                {/* Title */}
                <div className="shimmer-subtle h-8 w-80 rounded-lg mb-4" />
                
                {/* Subtitle */}
                <div className="shimmer-subtle h-4 w-48 rounded-lg mb-12" />
                
                {/* Main content area */}
                <div className="w-full max-w-md space-y-4">
                  <div className="shimmer-subtle h-6 w-full rounded-lg" />
                  <div className="shimmer-subtle h-6 w-5/6 rounded-lg" />
                  <div className="shimmer-subtle h-6 w-4/5 rounded-lg" />
                </div>
                
                {/* Signature areas */}
                <div className="flex justify-between w-full max-w-lg mt-16">
                  <div className="text-center">
                    <div className="shimmer-subtle h-1 w-32 rounded-full mb-2" />
                    <div className="shimmer-subtle h-4 w-24 rounded-lg mx-auto" />
                  </div>
                  <div className="text-center">
                    <div className="shimmer-subtle h-1 w-32 rounded-full mb-2" />
                    <div className="shimmer-subtle h-4 w-24 rounded-lg mx-auto" />
                  </div>
                </div>

                {/* Decorative corner elements */}
                <div className="absolute top-8 left-8">
                  <div className="shimmer-subtle h-16 w-16 rounded-full opacity-30" />
                </div>
                <div className="absolute top-8 right-8">
                  <div className="shimmer-subtle h-16 w-16 rounded-full opacity-30" />
                </div>
                <div className="absolute bottom-8 left-8">
                  <div className="shimmer-subtle h-16 w-16 rounded-full opacity-30" />
                </div>
                <div className="absolute bottom-8 right-8">
                  <div className="shimmer-subtle h-16 w-16 rounded-full opacity-30" />
                </div>
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex justify-center gap-3 mt-6">
              <div className="shimmer-base h-10 w-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 w-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 w-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 w-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
            </div>
          </div>

          {/* Format Controls */}
          <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
            <div className="shimmer-base h-6 w-32 rounded-lg mb-4">
              <div className="shimmer-wave" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="shimmer-base h-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
              <div className="shimmer-base h-10 rounded-lg">
                <div className="shimmer-wave" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Data Table */}
        <div className="w-[480px]">
          <div className="bg-white rounded-xl shadow-lg h-full">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 p-4">
              <div className="flex gap-4">
                <div className="shimmer-base h-10 w-24 rounded-lg">
                  <div className="shimmer-wave" />
                </div>
                <div className="shimmer-base h-10 w-24 rounded-lg">
                  <div className="shimmer-wave" />
                </div>
                <div className="shimmer-base h-10 w-24 rounded-lg">
                  <div className="shimmer-wave" />
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="p-4">
              {/* Table Header */}
              <div className="border-b border-gray-200 pb-3 mb-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="shimmer-base h-5 rounded">
                    <div className="shimmer-wave" />
                  </div>
                  <div className="shimmer-base h-5 rounded">
                    <div className="shimmer-wave" />
                  </div>
                  <div className="shimmer-base h-5 rounded">
                    <div className="shimmer-wave" />
                  </div>
                </div>
              </div>

              {/* Table Rows with staggered loading effect */}
              <div className="space-y-3">
                {[...Array(12)].map((_, index) => (
                  <div 
                    key={index} 
                    className="grid grid-cols-3 gap-4"
                    style={{ 
                      animationDelay: `${index * 0.1}s`,
                      opacity: 0,
                      animation: `fadeIn 0.5s ease-out ${index * 0.1}s forwards`
                    }}
                  >
                    <div className="shimmer-base h-8 rounded">
                      <div className="shimmer-wave" style={{ animationDelay: `${index * 0.1}s` }} />
                    </div>
                    <div className="shimmer-base h-8 rounded">
                      <div className="shimmer-wave" style={{ animationDelay: `${index * 0.1 + 0.05}s` }} />
                    </div>
                    <div className="shimmer-base h-8 rounded">
                      <div className="shimmer-wave" style={{ animationDelay: `${index * 0.1 + 0.1}s` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-gray-200 p-4 mt-4">
              <div className="flex justify-between items-center">
                <div className="shimmer-base h-5 w-32 rounded">
                  <div className="shimmer-wave" />
                </div>
                <div className="flex gap-2">
                  <div className="shimmer-base h-10 w-32 rounded-lg button-glow" style={{ backgroundColor: '#FFB700' }}>
                    <div className="shimmer-wave" />
                  </div>
                  <div className="shimmer-base h-10 w-40 rounded-lg" style={{ backgroundColor: '#2D6A4F' }}>
                    <div className="shimmer-wave" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-8 right-8">
        <div 
          className="shimmer-base h-14 w-14 rounded-full shadow-lg button-glow"
          style={{ backgroundColor: '#1B4332' }}
        >
          <div className="shimmer-wave" />
        </div>
      </div>
    </div>
  );
};

export default LoadingMockup3;