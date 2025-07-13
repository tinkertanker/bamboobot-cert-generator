import React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface NewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  hasUnsavedWork: boolean;
}

export const NewTemplateModal: React.FC<NewTemplateModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  hasUnsavedWork
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} width="w-96">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Start New Template?</h2>
            <p className="mt-2 text-sm text-gray-600">
              {hasUnsavedWork
                ? "Your current work has been autosaved and will remain accessible via Load Template."
                : "This will clear all current settings and start fresh."}
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Start New
          </Button>
        </div>
      </div>
    </Modal>
  );
};