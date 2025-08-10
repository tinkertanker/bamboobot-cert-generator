import { useCallback } from "react";
import type { EmailConfig } from "@/types/certificate";

interface UseDevModeProps {
  isDevelopment: boolean;
  devMode: boolean;
  setDevMode: (value: boolean) => void;
  emailTemplate: string;
  setEmailTemplate: (value: string) => void;
  numTestEmails: number;
  setNumTestEmails: (value: number) => void;
  forceServerSide: boolean;
  setForceServerSide: (value: boolean) => void;
  loadPresetData: (data: string) => Promise<void>;
  clearData: () => void;
  clearFile: () => void;
  clearPositions: () => void;
  clearPdfData: () => void;
  setUploadedFileUrl: (url: string | null) => void;
  setUploadedFile: (file: File | string | null) => void;
  setEmailConfig: (config: EmailConfig) => void;
}

interface UseDevModeReturn {
  handleDevModeToggle: () => void;
  handleEmailTemplateUpdate: () => void;
  presetCSVData: string;
}

// Preset data for dev mode (only available in development)
const PRESET_CSV_DATA = `Name,Department,Email
Maximilienne Featherstone-Harrington III,Executive Leadership,a@a.com
Bartholomäus von Quackenbusch-Wetherell,Innovation & Strategy,b@b.com
Anastasiopolis Meridienne Calderón-Rutherford,Global Operations,c@c.com`;

// Generate email test data function
const generateEmailTestData = (baseEmail: string, count: number): string => {
  if (!baseEmail || !baseEmail.includes("@")) {
    return PRESET_CSV_DATA; // Fallback to original preset data
  }

  const [localPart, domain] = baseEmail.split("@");
  const headers = "Name,Department,Email";
  const rows = Array.from({ length: count }, (_, i) => {
    const emailWithPlus = `${localPart}+${i + 1}@${domain}`;
    const names = [
      "Alex Johnson",
      "Jordan Smith",
      "Casey Brown",
      "Riley Davis",
      "Morgan Wilson",
      "Avery Miller",
      "Quinn Garcia",
      "Blake Martinez",
      "Cameron Anderson",
      "Drew Taylor",
      "Ellis Thompson",
      "Finley White",
      "Harper Lewis",
      "Indigo Clark",
      "Jamie Rodriguez",
      "Kai Walker",
      "Lane Robinson",
      "Micah Hall",
      "Nova Young",
      "Oakley King"
    ];
    const departments = [
      "Engineering",
      "Marketing",
      "Sales",
      "HR",
      "Finance",
      "Operations",
      "Design",
      "Legal",
      "Research",
      "Support"
    ];

    const name = names[i % names.length];
    const department = departments[i % departments.length];

    return `${name},${department},${emailWithPlus}`;
  });

  return [headers, ...rows].join("\n");
};

export function useDevMode({
  isDevelopment,
  devMode,
  setDevMode,
  emailTemplate,
  setEmailTemplate,
  numTestEmails,
  setNumTestEmails,
  forceServerSide,
  setForceServerSide,
  loadPresetData,
  clearData,
  clearFile,
  clearPositions,
  clearPdfData,
  setUploadedFileUrl,
  setUploadedFile,
  setEmailConfig
}: UseDevModeProps): UseDevModeReturn {
  const presetCSVData = isDevelopment ? PRESET_CSV_DATA : "";

  const handleEmailTemplateUpdate = useCallback(() => {
    if (!isDevelopment || !devMode) return;

    console.log("🔧 Dev Mode: Updating email template data...");
    const testData = emailTemplate
      ? generateEmailTestData(emailTemplate, numTestEmails)
      : presetCSVData;
    loadPresetData(testData);
  }, [isDevelopment, devMode, emailTemplate, numTestEmails, presetCSVData, loadPresetData]);

  const handleDevModeToggle = useCallback(() => {
    if (!isDevelopment) return; // Safety check - only works in development

    setDevMode(!devMode);
    
    if (!devMode) {
      // Enabling dev mode
      console.log("🔧 Dev Mode: Enabling...");

      // Enable dev mode: load preset data and template
      console.log("🔧 Dev Mode: Loading preset data...");
      const testData = emailTemplate
        ? generateEmailTestData(emailTemplate, numTestEmails)
        : presetCSVData;
      
      // Load data asynchronously
      loadPresetData(testData).then(() => {
        console.log("🔧 Dev Mode: Data loaded successfully");
      }).catch(err => {
        console.error("🔧 Dev Mode: Failed to load data:", err);
      });

      // Use existing template files in dev mode
      if (isDevelopment) {
        const existingImage = "/template_images/dev-mode-template.jpg"; // Dev mode template
        console.log("🔧 Dev Mode: Setting template image:", existingImage);
        setUploadedFileUrl(existingImage);
      }

      // Use the dev mode template PDF
      const existingPdf = "dev-mode-template.pdf"; // Using dev mode template
      const mockFile = new File([""], existingPdf, {
        type: "application/pdf"
      });
      setUploadedFile(mockFile);
      console.log("🔧 Dev Mode: Using existing PDF:", existingPdf);

      // Pre-fill email configuration in dev mode
      // Use setTimeout to ensure this runs after the email column detection
      setTimeout(() => {
        console.log("🔧 Dev Mode: Setting email config (delayed)...");
        setEmailConfig({
          senderName: "Bamboobot Testing",
          subject: "Your Certificate of Completion",
          message: `Hi there,

Congratulations on completing the program! Your certificate is ready.

Please find your certificate attached to this email or use the download link below.

Best regards,
Bamboobot
Email Sending Robot`,
          deliveryMethod: "download",
          isConfigured: true
        });
        console.log("🔧 Dev Mode: Email config set!");
      }, 500); // Increased delay to ensure email column detection completes first

      console.log("Dev mode enabled: preset template and data loaded");
    } else {
      // Disable dev mode: clear data
      clearData();
      clearFile();
      clearPositions();
      clearPdfData();
      setEmailConfig({
        senderName: "",
        subject: "",
        message: "",
        deliveryMethod: "download",
        isConfigured: false
      });
      console.log("Dev mode disabled: data cleared");
    }
  }, [
    isDevelopment,
    devMode,
    setDevMode,
    emailTemplate,
    numTestEmails,
    presetCSVData,
    loadPresetData,
    clearData,
    clearFile,
    clearPositions,
    clearPdfData,
    setUploadedFileUrl,
    setUploadedFile,
    setEmailConfig
  ]);

  return {
    handleDevModeToggle,
    handleEmailTemplateUpdate,
    presetCSVData
  };
}