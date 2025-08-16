import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { 
  FileImage, 
  Type, 
  Palette, 
  Table, 
  Mail, 
  FileDown,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
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
    description: "Create professional certificates in bulk with our easy-to-use tool. Let's walk through how it works.",
    icon: <Sparkles className="w-16 h-16 text-blue-500" />,
    features: [
      "Generate hundreds of certificates in minutes",
      "Drag-and-drop text positioning",
      "Email certificates directly to recipients",
      "Save projects for future use"
    ]
  },
  {
    title: "Step 1: Upload Your Template",
    description: "Start by uploading your certificate background image. Any PNG or JPEG image will work perfectly.",
    icon: <FileImage className="w-16 h-16 text-green-500" />,
    features: [
      "Supports PNG and JPEG formats",
      "Automatic PDF conversion",
      "Replace background anytime",
      "Works with any design"
    ]
  },
  {
    title: "Step 2: Add Your Data",
    description: "Paste your recipient data directly from Excel, Google Sheets, or any spreadsheet. We'll handle the rest!",
    icon: <Table className="w-16 h-16 text-purple-500" />,
    features: [
      "Copy & paste from spreadsheets",
      "Automatic column detection",
      "Smart email column recognition",
      "Search and filter capabilities"
    ]
  },
  {
    title: "Step 3: Position Text Fields",
    description: "Click on column names to add them to your certificate, then drag them to the perfect position.",
    icon: <Type className="w-16 h-16 text-orange-500" />,
    features: [
      "Drag-and-drop positioning",
      "Precise pixel control",
      "Multi-line text support",
      "Real-time preview"
    ]
  },
  {
    title: "Step 4: Format Your Text",
    description: "Customize fonts, colors, sizes, and alignment to match your brand perfectly.",
    icon: <Palette className="w-16 h-16 text-pink-500" />,
    features: [
      "7 professional fonts",
      "Custom colors",
      "Size and alignment options",
      "Save formatting as templates"
    ]
  },
  {
    title: "Step 5: Generate & Send",
    description: "Generate all certificates at once and optionally email them directly to recipients.",
    icon: <FileDown className="w-16 h-16 text-indigo-500" />,
    features: [
      "Bulk PDF generation",
      "Individual certificate downloads",
      "Direct email delivery",
      "ZIP download for all certificates"
    ]
  },
  {
    title: "Ready to Start?",
    description: "Would you like a quick interactive tour to see everything in action?",
    icon: <Play className="w-16 h-16 text-blue-500" />,
    features: [
      "Interactive step-by-step guide",
      "Learn by doing",
      "Access tutorial anytime from the header",
      "Skip if you prefer to explore on your own"
    ]
  }
];

export function OnboardingModal({ isOpen, onClose, onStartTour, onSkip }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onStartTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleSkip = () => {
    onSkip();
    onClose();
  };

  const step = onboardingSteps[currentStep];

  return (
    <Modal
      open={isOpen}
      onClose={handleSkip}
      className="max-w-2xl"
      width="w-full"
    >
      <div className="relative" style={{ minHeight: '480px', width: '100%' }}>
        <button
          onClick={handleSkip}
          className="absolute top-0 right-0 p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="text-center mb-8" style={{ width: '100%' }}>
          <div className="flex justify-center mb-6">
            {step.icon}
          </div>
          
          <h2 className="text-2xl font-bold mb-3 text-gray-900" style={{ minHeight: '36px' }}>
            {step.title}
          </h2>
          
          <p className="text-lg mb-6 text-gray-600 px-4" style={{ minHeight: '56px' }}>
            {step.description}
          </p>

          <div className="grid grid-cols-2 gap-3 text-left mx-auto px-4" style={{ minHeight: '120px', maxWidth: '28rem' }}>
            {step.features && step.features.map((feature, index) => (
              <div key={index} className="flex items-start">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 mr-2 flex-shrink-0" />
                <span className="text-sm text-gray-600">
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1">
            {onboardingSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentStep ? 'w-8' : 'w-2'
                }`}
                style={{
                  backgroundColor: index === currentStep ? COLORS.primary : "#e5e7eb"
                }}
              />
            ))}
          </div>

          <div className="text-sm text-gray-600">
            Step {currentStep + 1} of {onboardingSteps.length}
          </div>
        </div>

        <div className="flex justify-between gap-3">
          <Button
            onClick={handleSkip}
            variant="outline"
            className="flex-1"
          >
            Skip Tutorial
          </Button>

          <div className="flex gap-2 flex-1 justify-end">
            {!isFirstStep ? (
              <Button
                onClick={handlePrevious}
                variant="outline"
                className="gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
            ) : (
              <div className="w-[100px]" />
            )}

            <Button
              onClick={handleNext}
              className={`gap-2 ${isLastStep ? 'bg-green-600 hover:bg-green-700' : ''}`}
            >
              {isLastStep ? (
                <>
                  Start Interactive Tour
                  <Play className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}