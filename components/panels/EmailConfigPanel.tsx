import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { EmailConfigPanelProps } from "@/types/certificate";

export function EmailConfigPanel({
  detectedEmailColumn,
  emailConfig,
  setEmailConfig,
  selectedField,
  setSelectedField,
  setShowCenterGuide
}: EmailConfigPanelProps) {
  return (
    <div className="flex flex-col h-full space-y-6">
      <div
        className="flex items-center justify-between p-3 rounded-lg relative"
        style={{
          backgroundColor: "#FFFEF7",
          border: "1px solid #dddddd"
        }}>
        <h3 className="text-sm">
          <span className="text-gray-500 font-normal">Field:</span>{" "}
          <span className="font-medium text-gray-900">
            {detectedEmailColumn}
          </span>
        </h3>
        {selectedField && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedField(null);
              setShowCenterGuide({
                horizontal: false,
                vertical: false
              });
            }}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Email Settings */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              From:
            </label>
            <input
              type="text"
              value={emailConfig.senderName}
              onChange={(e) => {
                const newValue = e.target.value;
                setEmailConfig((prev) => {
                  const updated = { ...prev, senderName: newValue };
                  updated.isConfigured = !!(
                    updated.senderName &&
                    updated.subject &&
                    updated.message
                  );
                  return updated;
                });
              }}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Subject:
            </label>
            <input
              type="text"
              value={emailConfig.subject}
              onChange={(e) => {
                const newValue = e.target.value;
                setEmailConfig((prev) => {
                  const updated = { ...prev, subject: newValue };
                  updated.isConfigured = !!(
                    updated.senderName &&
                    updated.subject &&
                    updated.message
                  );
                  return updated;
                });
              }}
              placeholder="Your Certificate of Completion"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">
            Message (plain text):
          </label>
          <textarea
            value={emailConfig.message}
            onChange={(e) => {
              const newValue = e.target.value;
              setEmailConfig((prev) => {
                const updated = { ...prev, message: newValue };
                updated.isConfigured = !!(
                  updated.senderName &&
                  updated.subject &&
                  updated.message
                );
                return updated;
              });
            }}
            placeholder={`Hi there,\n\nYour certificate is ready! Please find it attached.\n\nThanks!`}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Delivery Method */}
      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          <p className="font-medium mb-1">Send certificate as:</p>
          <label className="inline-flex items-center ml-4 cursor-pointer">
            <input
              type="radio"
              name="deliveryMethod"
              value="download"
              checked={emailConfig.deliveryMethod === "download"}
              onChange={(e) =>
                setEmailConfig((prev) => ({
                  ...prev,
                  deliveryMethod: e.target.value as
                    | "download"
                    | "attachment"
                }))
              }
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              Download link (expires 90 days)
            </span>
          </label>
          <label className="inline-flex items-center ml-6 cursor-pointer">
            <input
              type="radio"
              name="deliveryMethod"
              value="attachment"
              checked={emailConfig.deliveryMethod === "attachment"}
              onChange={(e) =>
                setEmailConfig((prev) => ({
                  ...prev,
                  deliveryMethod: e.target.value as
                    | "download"
                    | "attachment"
                }))
              }
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              PDF attachment
            </span>
          </label>
        </div>
      </div>

      {/* Configuration Status */}
      <div className="mt-6 p-4 rounded-lg border">
        {emailConfig.senderName &&
        emailConfig.subject &&
        emailConfig.message ? (
          <div className="flex items-center gap-2 text-green-700">
            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">
              Email configuration complete.{" "}
              <span className="font-medium">
                Generate Individual PDFs
              </span>{" "}
              to send.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700">
            <div className="h-2 w-2 bg-amber-500 rounded-full"></div>
            <span className="text-sm font-medium">
              Complete all fields above to enable email sending
            </span>
          </div>
        )}
      </div>
    </div>
  );
}