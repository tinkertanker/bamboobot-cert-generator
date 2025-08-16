import { Monitor, Smartphone } from "lucide-react";

export function MobileWarningScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Icons */}
        <div className="flex justify-center items-center gap-4 mb-6">
          <div className="p-3 rounded-full bg-red-100">
            <Smartphone className="w-8 h-8 text-red-600" />
          </div>
          <div className="text-2xl text-gray-400">→</div>
          <div className="p-3 rounded-full bg-green-100">
            <Monitor className="w-8 h-8 text-green-600" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Desktop Recommended
        </h1>

        {/* Description */}
        <p className="text-gray-600 mb-6 leading-relaxed">
          Bamboobot Certificate Generator is designed for desktop use with precise drag-and-drop positioning. 
          For the best experience, please access this application on a desktop or laptop computer.
        </p>

        {/* Features that need desktop */}
        <div className="text-left space-y-2 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
            Precision text positioning
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
            Keyboard shortcuts
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
            Multi-panel interface
          </div>
        </div>

        {/* Continue anyway button */}
        <button
          onClick={() => {
            // Hide the mobile warning (parent component will handle this)
            const event = new CustomEvent('forceMobileAccess');
            window.dispatchEvent(event);
          }}
          className="w-full py-3 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Continue Anyway
        </button>

        {/* Footer */}
        <p className="text-xs text-gray-400 mt-4">
          Bamboobot by Tinkertanker
        </p>
      </div>
    </div>
  );
}