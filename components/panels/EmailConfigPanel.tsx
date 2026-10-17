import React from "react";
import { Mail } from "lucide-react";
import { COLORS } from "@/utils/styles";
import type { EmailConfigPanelProps, EmailConfig } from "@/types/certificate";

const INPUT_CLASSES =
  "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400";

export function EmailConfigPanel({
  detectedEmailColumn,
  emailConfig,
  setEmailConfig
}: EmailConfigPanelProps) {
  const updateField = (
    field: "senderName" | "subject" | "message",
    value: string
  ) => {
    setEmailConfig((prev: EmailConfig) => {
      const updated = { ...prev, [field]: value };
      updated.isConfigured = !!(
        updated.senderName &&
        updated.subject &&
        updated.message
      );
      return updated;
    });
  };

  const setDeliveryMethod = (value: string) =>
    setEmailConfig((prev: EmailConfig) => ({
      ...prev,
      deliveryMethod: value as "download" | "attachment"
    }));

  const isComplete = !!(
    emailConfig.senderName &&
    emailConfig.subject &&
    emailConfig.message
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      <div
        className="flex items-center gap-2 p-3 rounded-lg text-sm min-w-0"
        style={{
          backgroundColor: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`
        }}>
        <Mail className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden="true" />
        <span className="text-gray-500">Recipients from column:</span>
        <span className="font-medium text-gray-900 truncate">
          {detectedEmailColumn}
        </span>
      </div>

      {/* Email Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="email-sender-name"
            className="block text-sm font-medium text-gray-600 mb-1">
            Sender name
          </label>
          <input
            id="email-sender-name"
            type="text"
            autoComplete="off"
            value={emailConfig.senderName}
            onChange={(e) => updateField("senderName", e.target.value)}
            placeholder="Bamboobot"
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label
            htmlFor="email-subject"
            className="block text-sm font-medium text-gray-600 mb-1">
            Subject
          </label>
          <input
            id="email-subject"
            type="text"
            autoComplete="off"
            value={emailConfig.subject}
            onChange={(e) => updateField("subject", e.target.value)}
            placeholder="Your Certificate of Completion"
            className={INPUT_CLASSES}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="email-message"
          className="block text-sm font-medium text-gray-600 mb-1">
          Message (plain text)
        </label>
        <textarea
          id="email-message"
          value={emailConfig.message}
          onChange={(e) => updateField("message", e.target.value)}
          placeholder={`Hi there,\n\nYour certificate is ready! Please find it attached.\n\nThanks!`}
          rows={6}
          className={`${INPUT_CLASSES} resize-y`}
        />
      </div>

      {/* Delivery Method */}
      <fieldset className="text-sm text-gray-600">
        <legend className="font-medium mb-2">Send certificate as</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              name="deliveryMethod"
              value="download"
              checked={emailConfig.deliveryMethod === "download"}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              Download link (expires after 90 days)
            </span>
          </label>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="radio"
              name="deliveryMethod"
              value="attachment"
              checked={emailConfig.deliveryMethod === "attachment"}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">PDF attachment</span>
          </label>
        </div>
      </fieldset>

      {/* Configuration Status */}
      <div className="p-4 rounded-lg border" role="status">
        {isComplete ? (
          <div className="flex items-center gap-2 text-green-700">
            <div className="h-2 w-2 bg-green-500 rounded-full flex-shrink-0" aria-hidden="true"></div>
            <span className="text-sm">
              Email configuration complete. Choose{" "}
              <span className="font-medium">Generate</span> to create the
              certificates, then send them from the results window.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-amber-700">
            <div className="h-2 w-2 bg-amber-500 rounded-full flex-shrink-0" aria-hidden="true"></div>
            <span className="text-sm font-medium">
              Fill in the sender name, subject and message to enable email sending
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
