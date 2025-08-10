import React from "react";

interface DevModeControlsProps {
  isDevelopment: boolean;
  devMode: boolean;
  handleDevModeToggle: () => void;
  forceServerSide: boolean;
  setForceServerSide: (value: boolean) => void;
  isClientSupported: boolean;
  getCapabilityReport: () => Promise<string>;
  clientStage: string | null;
  clientProgress: number;
  emailTemplate: string;
  setEmailTemplate: (value: string) => void;
  numTestEmails: number;
  setNumTestEmails: (value: number) => void;
  handleEmailTemplateUpdate: () => void;
}

export function DevModeControls({
  isDevelopment,
  devMode,
  handleDevModeToggle,
  forceServerSide,
  setForceServerSide,
  isClientSupported,
  getCapabilityReport,
  clientStage,
  clientProgress,
  emailTemplate,
  setEmailTemplate,
  numTestEmails,
  setNumTestEmails,
  handleEmailTemplateUpdate
}: DevModeControlsProps) {
  // Only render in development mode
  if (!isDevelopment) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg border">
        <input
          type="checkbox"
          id="dev-mode-toggle"
          checked={devMode}
          onChange={handleDevModeToggle}
          className="w-4 h-4"
        />
        <label
          htmlFor="dev-mode-toggle"
          className="text-sm font-medium text-gray-700">
          Dev Mode
        </label>
      </div>

      {/* Server-side PDF Toggle - Only when dev mode is on */}
      {devMode && (
        <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 rounded-lg border border-yellow-200">
          <input
            type="checkbox"
            id="server-pdf-toggle"
            checked={forceServerSide}
            onChange={(e) => {
              setForceServerSide(e.target.checked);
              console.log(`📄 PDF Generation: ${e.target.checked ? 'SERVER-SIDE 📡' : 'CLIENT-SIDE 🚀'}`);
              if (!e.target.checked && isClientSupported) {
                // Log capability report when switching to client
                getCapabilityReport().then(report => {
                  console.log(report);
                });
              }
            }}
            className="w-4 h-4"
          />
          <label
            htmlFor="server-pdf-toggle"
            className="text-sm font-medium text-yellow-700">
            Force Server-Side
          </label>
          {!forceServerSide && clientStage && (
            <span className="text-xs text-blue-600 ml-2">
              Client: {clientStage} {clientProgress > 0 && `${Math.round(clientProgress * 100)}%`}
            </span>
          )}
        </div>
      )}

      {/* Email Template Controls - Only when dev mode is on */}
      {devMode && (
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
          <input
            type="email"
            placeholder="test@gmail.com"
            value={emailTemplate}
            onChange={(e) => setEmailTemplate(e.target.value)}
            className="w-40 px-2 py-1 text-xs border rounded"
          />
          <input
            type="number"
            min="1"
            max="100"
            value={numTestEmails}
            onChange={(e) =>
              setNumTestEmails(parseInt(e.target.value) || 10)
            }
            className="w-12 px-1 py-1 text-xs border rounded text-center"
          />
          <button
            onClick={handleEmailTemplateUpdate}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={!emailTemplate || !emailTemplate.includes("@")}>
            Generate
          </button>
        </div>
      )}
    </div>
  );
}