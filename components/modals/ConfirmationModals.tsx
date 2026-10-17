import React from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalTitle, ModalContent, ModalFooter } from "@/components/ui/modal";
import { DEFAULT_FONT_SIZE } from "@/utils/constants";
import type { ConfirmationModalsProps } from "@/types/certificate";

export function ConfirmationModals({
  showResetFieldModal,
  setShowResetFieldModal,
  showClearAllModal,
  setShowClearAllModal,
  selectedField,
  positions,
  setPositions,
  tableData,
  automaticTextColor
}: ConfirmationModalsProps) {
  const resetTextColor = automaticTextColor || "#000000";

  return (
    <>
      {/* Reset Field Confirmation Modal */}
      <Modal
        open={showResetFieldModal && !!selectedField}
        onClose={() => setShowResetFieldModal(false)}>
        <ModalHeader>
          <ModalTitle>Reset Field Formatting</ModalTitle>
        </ModalHeader>
        <ModalContent>
          Are you sure you want to reset the formatting for &ldquo;
          <span className="font-medium text-gray-900 break-words">{selectedField}</span>
          &rdquo; to the default settings?
        </ModalContent>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowResetFieldModal(false)}
            className="px-4 py-2">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedField && positions[selectedField]) {
                setPositions((prev) => ({
                  ...prev,
                  [selectedField]: {
                    ...prev[selectedField],
                    fontSize: DEFAULT_FONT_SIZE,
                    fontFamily: "Helvetica",
                    bold: false,
                    italic: false,
                    color: resetTextColor,
                    isColorAutomatic: true,
                    alignment: "left"
                  }
                }));
              }
              setShowResetFieldModal(false);
            }}
            className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700">
            Reset
          </Button>
        </ModalFooter>
      </Modal>

      {/* Clear All Formatting Confirmation Modal */}
      <Modal
        open={showClearAllModal}
        onClose={() => setShowClearAllModal(false)}>
        <ModalHeader>
          <ModalTitle>Clear all formatting</ModalTitle>
        </ModalHeader>
        <ModalContent>
          Are you sure you want to reset all text fields to default
          formatting? This action cannot be undone.
        </ModalContent>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowClearAllModal(false)}
            className="px-4 py-2">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (tableData.length > 0) {
                const updatedPositions = { ...positions };
                Object.keys(tableData[0]).forEach((key) => {
                  if (updatedPositions[key]) {
                    updatedPositions[key] = {
                      ...updatedPositions[key],
                      fontSize: DEFAULT_FONT_SIZE,
                      fontFamily: "Helvetica",
                      bold: false,
                      italic: false,
                      color: resetTextColor,
                      isColorAutomatic: true,
                      alignment: "left"
                    };
                  }
                });
                setPositions(updatedPositions);
              }
              setShowClearAllModal(false);
            }}
            className="px-4 py-2 bg-red-600 text-white hover:bg-red-700">
            Clear all
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
