import { useState, useEffect, useCallback } from "react";
import type { TableData, EmailConfig, EmailSendingStatus, PdfFile } from "@/types/certificate";

export interface UseEmailConfigProps {
  detectedEmailColumn: string | null;
  tableData: TableData[];
  individualPdfsData: PdfFile[] | null;
}

export interface UseEmailConfigReturn {
  emailConfig: EmailConfig;
  setEmailConfig: React.Dispatch<React.SetStateAction<EmailConfig>>;
  emailSendingStatus: EmailSendingStatus;
  setEmailSendingStatus: React.Dispatch<React.SetStateAction<EmailSendingStatus>>;
  sendCertificateEmail: (
    index: number,
    file: PdfFile
  ) => Promise<void>;
  hasEmailColumn: boolean;
}

export function useEmailConfig({
  detectedEmailColumn,
  tableData,
  individualPdfsData
}: UseEmailConfigProps): UseEmailConfigReturn {
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    senderName: "",
    subject: "",
    message: "",
    deliveryMethod: "download",
    isConfigured: false
  });

  const [emailSendingStatus, setEmailSendingStatus] = useState<EmailSendingStatus>({});

  // Reset email sending status when table data changes (new recipients loaded)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("📧 useEmailConfig: tableData changed, resetting email sending status");
    }
    setEmailSendingStatus({});
  }, [tableData]);

  // Handle email config reset when email column changes
  useEffect(() => {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) console.log("📧 useEmailConfig: detectedEmailColumn changed to:", detectedEmailColumn);
    // Only reset if email config is not already configured (e.g., not in dev mode)
    setEmailConfig((prev) => {
      if (prev.isConfigured) {
        if (isDev) console.log("📧 useEmailConfig: Email config already configured, keeping existing config");
        return prev;
      }
      if (isDev) console.log("📧 useEmailConfig: Resetting email config...");
      return {
        senderName: "",
        subject: "",
        message: "",
        deliveryMethod: "download",
        isConfigured: false
      };
    });
  }, [detectedEmailColumn]);

  // Derive from detectedEmailColumn (already computed by useTableData)
  const hasEmailColumn = detectedEmailColumn !== null;

  // Send individual certificate via email
  const sendCertificateEmail = useCallback(async (
    index: number,
    file: { filename: string; url: string; originalIndex: number; data?: Uint8Array }
  ) => {
    if (
      !detectedEmailColumn ||
      !individualPdfsData ||
      !emailConfig.isConfigured
    )
      return;

    const recipientData = tableData[file.originalIndex || index];
    const recipientEmail = recipientData[detectedEmailColumn];

    if (!recipientEmail) {
      alert("No email address found for this recipient");
      return;
    }

    // Update sending status
    setEmailSendingStatus((prev) => ({ ...prev, [index]: "sending" }));

    try {
      // Get recipient name (try common name columns)
      const nameColumns = [
        "Name",
        "name",
        "Full Name",
        "full_name",
        "fullname"
      ];
      const recipientName =
        nameColumns
          .map((col) => recipientData[col])
          .find((val) => val && val.trim() !== "") || "Certificate Recipient";

      // Replace [Recipient Name] placeholder in message
      const personalizedMessage = emailConfig.message.replace(
        /\[Recipient Name\]/g,
        recipientName
      );

      // Prepare email data
      const emailData: any = {
        to: recipientEmail,
        subject: emailConfig.subject,
        recipientName: recipientName,
        senderName: emailConfig.senderName,
        customMessage: personalizedMessage,
        deliveryMethod: emailConfig.deliveryMethod,
        attachmentName: file.filename
      };

      // Handle client-side vs server-side PDFs
      if (file.data && file.url.startsWith('blob:')) {
        // Client-side generated PDF - always use attachment mode
        // Convert Uint8Array to regular array for JSON serialization
        emailData.attachmentData = Array.from(file.data);
        // Override delivery method to attachment for client-side PDFs
        emailData.deliveryMethod = "attachment";
      } else {
        // Server-side generated PDF - use URLs
        if (emailConfig.deliveryMethod === "attachment") {
          emailData.attachmentUrl = file.url;
        } else {
          emailData.downloadUrl = file.url;
        }
      }

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(emailData)
      });

      const result = await response.json();

      if (response.ok) {
        setEmailSendingStatus((prev) => ({ ...prev, [index]: "sent" }));

        // Mark as emailed in R2 if using cloud storage
        if (
          file.url.includes("r2.cloudflarestorage.com") ||
          (process.env.R2_PUBLIC_URL &&
            file.url.startsWith(process.env.R2_PUBLIC_URL))
        ) {
          try {
            await fetch("/api/mark-emailed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileUrl: file.url })
            });
          } catch (error) {
            console.warn("Failed to mark file as emailed:", error);
          }
        }
      } else {
        throw new Error(result.error || "Failed to send email");
      }
    } catch (error) {
      console.error("Email sending failed:", error);
      setEmailSendingStatus((prev) => ({ ...prev, [index]: "error" }));
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to send email: ${errorMessage}`);
    }
  }, [detectedEmailColumn, individualPdfsData, emailConfig, tableData]);

  return {
    emailConfig,
    setEmailConfig,
    emailSendingStatus,
    setEmailSendingStatus,
    sendCertificateEmail,
    hasEmailColumn,
  };
}