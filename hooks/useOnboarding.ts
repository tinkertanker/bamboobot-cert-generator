import { useState, useEffect, useCallback } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const ONBOARDING_KEY = "bamboobot_onboarding_completed";
const TOUR_KEY = "bamboobot_tour_completed";

interface TourStep {
  element?: string;
  popover: {
    title: string;
    description: string;
    side?: "top" | "bottom" | "left" | "right";
    align?: "start" | "center" | "end";
  };
}

const tourSteps: TourStep[] = [
  {
    popover: {
      title: "Welcome to the Interactive Tour! 👋",
      description: "Let me show you around the certificate generator. You can exit this tour anytime by pressing ESC or clicking outside.",
      side: "bottom",
      align: "center"
    }
  },
  {
    element: '[data-tour="upload-area"]',
    popover: {
      title: "Upload Your Certificate Template",
      description: "Click here to upload your background image. You can use any PNG or JPEG file. We'll also provide a sample template if you want to try it out first!",
      side: "bottom",
      align: "start"
    }
  },
  {
    element: '[data-tour="data-tab"]',
    popover: {
      title: "Add Your Data",
      description: "This is where you'll paste your recipient data. Simply copy from Excel or Google Sheets and paste it here. The first row should contain column headers.",
      side: "bottom",
      align: "start"
    }
  },
  {
    element: '[data-tour="certificate-preview"]',
    popover: {
      title: "Position Your Text Fields",
      description: "When you paste data, text fields automatically appear on the certificate. You can drag them around to position them exactly where you want.",
      side: "left",
      align: "center"
    }
  },
  {
    element: '[data-tour="formatting-tab"]',
    popover: {
      title: "Format Your Text",
      description: "Switch to the Formatting tab to customize fonts, colors, sizes, and alignment for each text field.",
      side: "bottom",
      align: "center"
    }
  },
  {
    element: '[data-tour="email-tab"]',
    popover: {
      title: "Configure Email (Optional)",
      description: "If you want to email certificates directly to recipients, configure your email settings here. We automatically detect email columns in your data.",
      side: "bottom",
      align: "center"
    }
  },
  {
    element: '[data-tour="navigation"]',
    popover: {
      title: "Preview Different Entries",
      description: "Use these navigation buttons to preview how different entries from your data will look on the certificate.",
      side: "top",
      align: "center"
    }
  },
  {
    element: '[data-tour="generate-pdf"]',
    popover: {
      title: "Generate Certificates",
      description: "When you're ready, click here to generate all certificates. You can download them individually, as a ZIP file, or email them directly.",
      side: "left",
      align: "end"
    }
  },
  {
    element: '[data-tour="save-project"]',
    popover: {
      title: "Save Your Project",
      description: "Don't forget to save your project! This saves both your template and data, so you can come back and regenerate certificates anytime.",
      side: "left",
      align: "end"
    }
  },
  {
    popover: {
      title: "You're All Set! 🎉",
      description: "That's everything you need to know! You can always access this tour again from the Help menu in the header. Happy certificate making!",
      side: "bottom",
      align: "center"
    }
  }
];

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true);
  const [driverInstance, setDriverInstance] = useState<any>(null);

  useEffect(() => {
    const hasCompleted = localStorage.getItem(ONBOARDING_KEY);
    if (!hasCompleted) {
      setHasSeenOnboarding(false);
      setShowOnboarding(true);
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setHasSeenOnboarding(true);
    setShowOnboarding(false);
  }, []);

  const startTour = useCallback(() => {
    completeOnboarding();
    
    const driverObj = driver({
      showProgress: true,
      showButtons: ["next", "previous", "close"],
      animate: true,
      overlayColor: "rgba(0, 0, 0, 0.7)",
      smoothScroll: true,
      allowClose: true,
      stagePadding: 4,
      stageRadius: 8,
      popoverClass: "driver-popover-theme",
      progressText: "Step {{current}} of {{total}}",
      nextBtnText: "Next →",
      prevBtnText: "← Previous",
      doneBtnText: "Done ✓",
      steps: tourSteps,
      onDestroyStarted: () => {
        localStorage.setItem(TOUR_KEY, "true");
        if (driverInstance) {
          driverInstance.destroy();
        }
      }
    });

    setDriverInstance(driverObj);
    driverObj.drive();
  }, [completeOnboarding, driverInstance]);

  const restartTour = useCallback(() => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    startTour();
  }, [driverInstance, startTour]);

  const skipOnboarding = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    localStorage.removeItem(TOUR_KEY);
    setHasSeenOnboarding(false);
    setShowOnboarding(true);
  }, []);

  return {
    showOnboarding,
    hasSeenOnboarding,
    startTour,
    restartTour,
    skipOnboarding,
    resetOnboarding,
    setShowOnboarding
  };
}