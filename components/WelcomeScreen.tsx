import React from "react";
import { Button } from "@/components/ui/button";
import { 
  FileImage, 
  Table, 
  Play,
  Sparkles,
  ArrowRight,
  Download,
  BookOpen
} from "lucide-react";
import { SAMPLE_CERTIFICATE_DATA, SAMPLE_WELCOME_MESSAGE } from "@/utils/sampleData";

interface WelcomeScreenProps {
  onStartTour: () => void;
  onLoadSampleData: () => void;
  onSkip: () => void;
  onUseSampleTemplate: () => void;
}

export function WelcomeScreen({ 
  onStartTour, 
  onLoadSampleData, 
  onSkip,
  onUseSampleTemplate 
}: WelcomeScreenProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-purple-50 z-50 overflow-auto">
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-white rounded-full shadow-lg">
                <Sparkles className="w-16 h-16 text-blue-500" />
              </div>
            </div>
            
            <h1 className="text-4xl font-bold mb-4 text-gray-900">
              Welcome to Bamboobot Certificate Generator!
            </h1>
            
            <p className="text-xl mb-8 text-gray-600">
              Create professional certificates in bulk with just a few clicks
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6 text-gray-900">
              Quick Start Options
            </h2>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <button
                onClick={onStartTour}
                className="group p-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl text-white hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
              >
                <Play className="w-12 h-12 mb-4 mx-auto" />
                <h3 className="font-semibold text-lg mb-2">Interactive Tour</h3>
                <p className="text-sm opacity-90">
                  Learn by doing with our step-by-step guide
                </p>
                <div className="mt-4 flex items-center justify-center text-sm font-medium">
                  Start Tour
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              <button
                onClick={() => {
                  onUseSampleTemplate();
                  onLoadSampleData();
                }}
                className="group p-6 bg-gradient-to-br from-green-500 to-green-600 rounded-xl text-white hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
              >
                <Download className="w-12 h-12 mb-4 mx-auto" />
                <h3 className="font-semibold text-lg mb-2">Try Sample Data</h3>
                <p className="text-sm opacity-90">
                  Explore with pre-loaded template and data
                </p>
                <div className="mt-4 flex items-center justify-center text-sm font-medium">
                  Load Sample
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>

              <button
                onClick={onSkip}
                className="group p-6 bg-white border-2 border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
              >
                <BookOpen className="w-12 h-12 mb-4 mx-auto text-gray-600" />
                <h3 className="font-semibold text-lg mb-2 text-gray-900">
                  Start Fresh
                </h3>
                <p className="text-sm text-gray-600">
                  Jump right in and explore on your own
                </p>
                <div className="mt-4 flex items-center justify-center text-sm font-medium text-green-700">
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold mb-4 text-gray-900">
                How It Works
              </h3>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-blue-600">1</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-1">Upload Template</h4>
                    <p className="text-xs text-gray-600">
                      Use any image as your certificate background
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-green-600">2</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-1">Add Data</h4>
                    <p className="text-xs text-gray-600">
                      Paste recipient data from spreadsheets
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center mr-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-purple-600">3</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-1">Position Text</h4>
                    <p className="text-xs text-gray-600">
                      Drag text fields to perfect positions
                    </p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center mr-3 flex-shrink-0">
                    <span className="text-sm font-semibold text-orange-600">4</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm mb-1">Generate</h4>
                    <p className="text-xs text-gray-600">
                      Create all certificates with one click
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              You can access the tutorial anytime from the Help menu
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}