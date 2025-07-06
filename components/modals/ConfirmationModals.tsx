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
  tableData
}: ConfirmationModalsProps) {
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
          Are you sure you want to reset the formatting for &quot;
          {selectedField}&quot; to default settings?
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
                    color: "#000000",
                    alignment: "left"
                  }
                }));
              }
              setShowResetFieldModal(false);
            }}
            className="px-4 py-2"
            style={{
              backgroundColor: "#6B7280",
              color: "white"
            }}>
            Reset
          </Button>
        </ModalFooter>
      </Modal>

      {/* Clear All Formatting Confirmation Modal */}
      <Modal
        open={showClearAllModal}
        onClose={() => setShowClearAllModal(false)}>
        <ModalHeader>
          <ModalTitle>Clear All Formatting</ModalTitle>
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
                      color: "#000000",
                      alignment: "left"
                    };
                  }
                });
                setPositions(updatedPositions);
              }
              setShowClearAllModal(false);
            }}
            className="px-4 py-2"
            style={{
              backgroundColor: "#DC2626",
              color: "white"
            }}>
            Clear All
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}