import React, { useState } from "react";
import { StorageMonitor } from "@/components/StorageMonitor";
import { LocalStorageMonitor } from "@/components/LocalStorageMonitor";
import { ChevronUp, Minimize2, Wrench } from "lucide-react";

interface DevModeFooterProps {
  isDevelopment: boolean;
  devMode: boolean;
  handleDevModeToggle: () => void;
  emailTemplate: string;
  setEmailTemplate: (value: string) => void;
  numTestEmails: number;
  setNumTestEmails: (value: number) => void;
  handleEmailTemplateUpdate: () => void;
}

export function DevModeFooter({
  isDevelopment,
  devMode,
  handleDevModeToggle,
  emailTemplate,
  setEmailTemplate,
  numTestEmails,
  setNumTestEmails,
  handleEmailTemplateUpdate
}: DevModeFooterProps) {
  const [isMinimized, setIsMinimized] = useState(true); // Default to minimized

  // Only render in development mode
  if (!isDevelopment) return null;

  // Minimized state - shows in bottom right corner
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition-colors"
          title="Expand Dev Mode Panel"
        >
          <ChevronUp className="w-4 h-4" />
          <Wrench className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Full footer bar
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-700 shadow-2xl">
      <div className="flex items-center justify-end px-4 py-2">
        <div className="flex items-center gap-4">
          {/* Dev Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg">
            <input
              type="checkbox"
              id="dev-mode-footer-toggle"
              checked={devMode}
              onChange={handleDevModeToggle}
              className="w-4 h-4"
            />
            <label
              htmlFor="dev-mode-footer-toggle"
              className="text-sm font-medium text-gray-100">
              Dev Mode
            </label>
          </div>

          {/* Storage Monitors - Always visible in development */}
          <div className="flex items-center gap-3">
            <StorageMonitor />
            <LocalStorageMonitor />
          </div>

          {/* Email Template Controls - Only when dev mode is on */}
          {devMode && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-900/30 rounded-lg border border-blue-700">
              <input
                type="email"
                placeholder="test@gmail.com"
                value={emailTemplate}
                onChange={(e) => setEmailTemplate(e.target.value)}
                className="w-40 px-2 py-1 text-xs bg-gray-800 text-gray-100 border border-gray-600 rounded placeholder-gray-500"
              />
              <input
                type="number"
                min="1"
                max="100"
                value={numTestEmails}
                onChange={(e) =>
                  setNumTestEmails(parseInt(e.target.value) || 10)
                }
                className="w-12 px-1 py-1 text-xs bg-gray-800 text-gray-100 border border-gray-600 rounded text-center"
              />
              <button
                onClick={handleEmailTemplateUpdate}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                disabled={!emailTemplate || !emailTemplate.includes("@")}>
                Generate
              </button>
            </div>
          )}
        </div>

        {/* Minimize button */}
        <button
          onClick={() => setIsMinimized(true)}
          className="p-1 hover:bg-gray-800 rounded transition-colors ml-4"
          title="Minimize Dev Mode"
        >
          <Minimize2 className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>
  );
}
