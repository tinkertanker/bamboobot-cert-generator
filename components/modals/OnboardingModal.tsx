import React, { useEffect, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  FileImage,
  Type,
  Palette,
  Table,
  FileDown,
  ChevronRight,
  ChevronLeft,
  X,
  Play
} from "lucide-react";
import { COLORS } from "@/utils/styles";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onSkip: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  features?: string[];
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Welcome to Bamboobot Certificate Generator! 🎉",
    description:
      "Create professional certificates in bulk with our easy-to-use tool. Let's walk through how it works.",
    icon: <Image src="/bamboobot-icon.png" alt="" width={64} height={64} className="w-16 h-16" priority />,
    features: [
      "Generate hundreds of certificates in minutes",
      "Drag-and-drop text positioning",
      "Email certificates directly to recipients",
      "Save projects for future use"
    ]
  },
  {
    title: "Step 1: Upload Your Template",
    description:
      "Start by uploading your certificate background image. Any PNG or JPEG image will work perfectly.",
    icon: <FileImage className="w-16 h-16 text-green-700" />,
    features: [
      "Supports PNG and JPEG formats",
      "Automatic PDF conversion",
      "Replace background anytime",
      "Works with any design"
    ]
  },
  {
    title: "Step 2: Add Your Data",
    description:
      "Paste your recipient data directly from Excel, Google Sheets, or any spreadsheet. We'll handle the rest!",
    icon: <Table className="w-16 h-16 text-green-700" />,
    features: [
      "Copy & paste from spreadsheets",
      "Automatic column detection",
      "Smart email column recognition",
      "Search and filter capabilities"
    ]
  },
  {
    title: "Step 3: Position Text Fields",
    description:
      "A text field appears on your certificate for each column of data. Drag them into the perfect position.",
    icon: <Type className="w-16 h-16 text-green-700" />,
    features: [
      "Drag-and-drop positioning",
      "Precise pixel control",
      "Multi-line text support",
      "Real-time preview"
    ]
  },
  {
    title: "Step 4: Format Your Text",
    description:
      "Customise fonts, colours, sizes and alignment to match your brand perfectly.",
    icon: <Palette className="w-16 h-16 text-green-700" />,
    features: [
      "7 professional fonts",
      "Custom colours",
      "Size and alignment options",
      "Formatting is saved with your project"
    ]
  },
  {
    title: "Step 5: Generate & Send",
    description:
      "Generate all certificates at once and optionally email them directly to recipients.",
    icon: <FileDown className="w-16 h-16 text-green-700" />,
    features: [
      "Bulk PDF generation",
      "Individual certificate downloads",
      "Direct email delivery",
      "ZIP download for all certificates"
    ]
  },
  {
    title: "Ready to Start?",
    description:
      "Would you like a quick interactive tour to see everything in action?",
    icon: <Play className="w-16 h-16 text-green-700" />,
    features: [
      "Interactive step-by-step guide",
      "Learn by doing",
      "Reopen the tutorial any time from the header",
      "Skip if you prefer to explore on your own"
    ]
  }
];

export function OnboardingModal({
  isOpen,
  onClose,
  onStartTour,
  onSkip
}: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onStartTour();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  // Left/right arrow keys step through the slides
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentStep((prev) => Math.min(onboardingSteps.length - 1, prev + 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentStep((prev) => Math.max(0, prev - 1));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const step = onboardingSteps[currentStep];

  return (
    <Modal
      open={isOpen}
      onClose={handleSkip}
      className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto"
      width="w-[calc(100%-2rem)]"
      ariaLabelledBy="onboarding-title"
      ariaDescribedBy="onboarding-description">
      <div className="relative w-full sm:min-h-[480px]">
        <button
          type="button"
          onClick={handleSkip}
          className="absolute top-0 right-0 p-2 rounded-full hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
          aria-label="Close tutorial">
          <X className="w-5 h-5 text-gray-700" aria-hidden="true" />
        </button>

        <div className="text-center mb-8 w-full">
          <div className="flex justify-center mb-6" aria-hidden="true">{step.icon}</div>

          <h2
            id="onboarding-title"
            className="text-xl sm:text-2xl font-bold mb-3 text-gray-900 sm:min-h-[36px]">
            {step.title}
          </h2>

          <p
            id="onboarding-description"
            className="text-base sm:text-lg mb-6 text-gray-600 sm:px-4 sm:min-h-[56px]">
            {step.description}
          </p>

          {step.features && (
            <ul
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-left mx-auto px-1 max-w-md sm:min-h-[120px]"
              aria-label="Highlights">
              {step.features.map((feature) => (
                <li key={feature} className="flex items-start">
                  <span className="w-2 h-2 rounded-full bg-green-900 mt-2 mr-2 flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1" aria-hidden="true">
            {onboardingSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep ? "w-8" : "w-2"
                }`}
                style={{
                  backgroundColor:
                    index === currentStep ? COLORS.primary : "#e5e7eb"
                }}
              />
            ))}
          </div>

          <div className="text-sm text-gray-600" aria-live="polite">
            Step {currentStep + 1} of {onboardingSteps.length}
            {/* Announce the step's title too; it's already visible as the heading */}
            <span className="sr-only">: {step.title}</span>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
          <Button type="button" onClick={handleSkip} variant="ghost" className="text-gray-700">
            Skip Tutorial
          </Button>

          <div className="flex gap-2 justify-end">
            {!isFirstStep && (
              <Button
                type="button"
                onClick={handlePrevious}
                variant="outline"
                className="gap-2">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Previous
              </Button>
            )}

            <Button
              type="button"
              autoFocus
              onClick={handleNext}
              className={`gap-2 ${isLastStep ? "bg-green-700 hover:bg-green-800" : ""}`}>
              {isLastStep ? (
                <>
                  Start Interactive Tour
                  <Play className="w-4 h-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
