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

  // Handle email config reset when email column changes
  useEffect(() => {
    setEmailConfig({
      senderName: "",
      subject: "",
      message: "",
      deliveryMethod: "download",
      isConfigured: false
    });
  }, [detectedEmailColumn]);

  // Function to detect if any column contains email addresses
  const hasEmailColumn = (() => {
    if (tableData.length === 0) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Check each column for email patterns
    const columns = Object.keys(tableData[0]);
    return columns.some((column) => {
      // Check if at least 50% of non-empty values in this column are emails
      const values = tableData
        .map((row) => row[column])
        .filter((val) => val && val.trim());
      if (values.length === 0) return false;

      const emailCount = values.filter((val) =>
        emailRegex.test(val.trim())
      ).length;
      return emailCount / values.length >= 0.5;
    });
  })();

  // Send individual certificate via email
  const sendCertificateEmail = useCallback(async (
    index: number,
    file: { filename: string; url: string; originalIndex: number }
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

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: recipientEmail,
          subject: emailConfig.subject,
          recipientName: recipientName,
          senderName: emailConfig.senderName,
          customMessage: personalizedMessage,
          deliveryMethod: emailConfig.deliveryMethod,
          attachmentUrl:
            emailConfig.deliveryMethod === "attachment" ? file.url : null,
          downloadUrl:
            emailConfig.deliveryMethod === "download" ? file.url : null,
          attachmentName: file.filename
        })
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