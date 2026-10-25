import { useCallback } from "react";
import type { EmailConfig } from "@/types/certificate";

interface UseDevModeProps {
  isDevelopment: boolean;
  devMode: boolean;
  setDevMode: (value: boolean) => void;
  baseEmail: string;
  numTestEmails: number;
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
const generateEmailTestData = (email: string, count: number): string => {
  if (!email || !email.includes("@")) {
    return PRESET_CSV_DATA; // Fallback to original preset data
  }

  const [localPart, domain] = email.split("@");
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
  baseEmail,
  numTestEmails,
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

    const testData = baseEmail
      ? generateEmailTestData(baseEmail, numTestEmails)
      : presetCSVData;
    loadPresetData(testData);
  }, [isDevelopment, devMode, baseEmail, numTestEmails, presetCSVData, loadPresetData]);

  const handleDevModeToggle = useCallback(() => {
    if (!isDevelopment) return;

    setDevMode(!devMode);
    
    if (!devMode) {
      // Enabling: load preset data and template
      const testData = baseEmail
        ? generateEmailTestData(baseEmail, numTestEmails)
        : presetCSVData;
      
      loadPresetData(testData).catch(err => {
        console.error("🔧 Dev Mode: Failed to load data:", err);
      });

      setUploadedFileUrl("/template_images/dev-mode-template.jpg");
      setUploadedFile(new File([""], "dev-mode-template.pdf", {
        type: "application/pdf"
      }));

      // Delay so this runs after email column detection, which resets the config
      setTimeout(() => {
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
      }, 500);
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
    }
  }, [
    isDevelopment,
    devMode,
    setDevMode,
    baseEmail,
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
