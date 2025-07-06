import * as React from "react"
import { cn } from "@/lib/utils"

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Function to call when the modal should be closed */
  onClose: () => void
  /** Modal content */
  children: React.ReactNode
  /** Custom className for the modal container */
  className?: string
  /** Custom className for the backdrop */
  backdropClassName?: string
  /** Whether clicking the backdrop should close the modal (default: true) */
  closeOnBackdropClick?: boolean
  /** Custom width for the modal (default: w-96) */
  width?: string
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({ 
    open, 
    onClose, 
    children, 
    className, 
    backdropClassName, 
    closeOnBackdropClick = true,
    width = "w-96",
    ...props 
  }, ref) => {
    // Handle ESC key press
    React.useEffect(() => {
      const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && open) {
          onClose()
        }
      }

      if (open) {
        document.addEventListener('keydown', handleEscKey)
      }

      return () => {
        document.removeEventListener('keydown', handleEscKey)
      }
    }, [open, onClose])

    if (!open) return null

    return (
      <div
        className={cn(
          "fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center",
          backdropClassName
        )}
        onClick={closeOnBackdropClick ? onClose : undefined}
        {...props}
      >
        <div
          ref={ref}
          className={cn(
            "relative bg-white bg-opacity-100 mx-auto rounded-lg shadow-xl p-6 border border-gray-200",
            width,
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    )
  }
)

Modal.displayName = "Modal"

export interface ModalHeaderProps {
  children: React.ReactNode
  className?: string
}

export const ModalHeader = React.forwardRef<HTMLDivElement, ModalHeaderProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("mb-4", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ModalHeader.displayName = "ModalHeader"

export interface ModalTitleProps {
  children: React.ReactNode
  className?: string
}

export const ModalTitle = React.forwardRef<HTMLHeadingElement, ModalTitleProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <h2
        ref={ref}
        className={cn("text-lg font-semibold", className)}
        {...props}
      >
        {children}
      </h2>
    )
  }
)

ModalTitle.displayName = "ModalTitle"

export interface ModalContentProps {
  children: React.ReactNode
  className?: string
}

export const ModalContent = React.forwardRef<HTMLDivElement, ModalContentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("text-gray-600 mb-6", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ModalContent.displayName = "ModalContent"

export interface ModalFooterProps {
  children: React.ReactNode
  className?: string
}

export const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex gap-3 justify-end", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ModalFooter.displayName = "ModalFooter"