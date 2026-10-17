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
  /** Whether pressing Escape should close the modal (default: true) */
  closeOnEscape?: boolean
  /** Custom width for the modal (default: w-96) */
  width?: string
  /** Accessible name, for dialogs without a visible title */
  ariaLabel?: string
  /**
   * id of the element that labels the dialog. When omitted, a ModalTitle or the
   * first heading inside the dialog is used.
   */
  ariaLabelledBy?: string
  /** id of the element that describes the dialog */
  ariaDescribedBy?: string
  /** Element to focus when the dialog opens (defaults to the dialog itself) */
  initialFocusRef?: React.RefObject<HTMLElement>
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "summary",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])"
].join(",")

// Stack of open modals so only the top-most one reacts to Escape / Tab.
// Child effects run before parents', so a modal rendered inside another one is
// slotted above its parent rather than simply pushed.
const modalStack: Array<{ token: symbol; el: HTMLElement | null }> = []
// Body scroll lock is reference-counted so nested modals don't unlock early.
let scrollLockCount = 0
let previousBodyOverflow = ""

function lockBodyScroll() {
  if (typeof document === "undefined") return
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  scrollLockCount += 1
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
  }
}

const ModalTitleIdContext = React.createContext<string | undefined>(undefined)
// Lets a modal opened from inside another one use a lighter backdrop instead of
// stacking a second full-strength dim + blur.
const ModalNestingContext = React.createContext(false)

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

export const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({
    open,
    onClose,
    children,
    className,
    backdropClassName,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    width = "w-96",
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    initialFocusRef,
    ...props
  }, ref) => {
    const dialogRef = React.useRef<HTMLDivElement | null>(null)
    const titleId = React.useId()
    const isNested = React.useContext(ModalNestingContext)
    const [autoLabelId, setAutoLabelId] = React.useState<string | undefined>()

    // Keep the latest callbacks/flags in refs so the document listener is only
    // registered once per open. Re-registering on every render meant a listener
    // removed mid-dispatch (e.g. by another Escape handler's state update) was
    // skipped, so the first Escape press could be swallowed.
    const onCloseRef = React.useRef(onClose)
    const closeOnEscapeRef = React.useRef(closeOnEscape)
    React.useEffect(() => {
      onCloseRef.current = onClose
      closeOnEscapeRef.current = closeOnEscape
    })

    const setDialogRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        dialogRef.current = node
        assignRef(ref, node)
      },
      [ref]
    )

    React.useEffect(() => {
      if (!open) return

      const token = Symbol("modal")
      const ownEl = dialogRef.current
      const childIndex = ownEl
        ? modalStack.findIndex((entry) => !!entry.el && ownEl.contains(entry.el))
        : -1
      if (childIndex === -1) modalStack.push({ token, el: ownEl })
      else modalStack.splice(childIndex, 0, { token, el: ownEl })
      lockBodyScroll()

      const previouslyFocused =
        typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null

      // Move focus into the dialog unless something inside already took it (e.g. autoFocus)
      const dialog = dialogRef.current
      if (dialog && !dialog.contains(document.activeElement)) {
        const target = initialFocusRef?.current ?? dialog
        target.focus({ preventScroll: true })
      }

      const isTopMost = () => modalStack[modalStack.length - 1]?.token === token

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!isTopMost()) return

        if (event.key === "Escape") {
          if (closeOnEscapeRef.current) {
            event.preventDefault()
            onCloseRef.current()
          }
          return
        }

        if (event.key === "Tab") {
          const node = dialogRef.current
          if (!node) return
          const focusable = Array.from(
            node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
          ).filter((el) => !el.closest("[hidden]"))
          if (focusable.length === 0) {
            event.preventDefault()
            node.focus()
            return
          }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          const active = document.activeElement
          if (event.shiftKey && (active === first || active === node || !node.contains(active))) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (active === last || !node.contains(active))) {
            event.preventDefault()
            first.focus()
          }
        }
      }

      // Capture phase so we run before page-level shortcut handlers; those can
      // check `event.defaultPrevented` to ignore an Escape the modal consumed.
      document.addEventListener("keydown", handleKeyDown, true)

      return () => {
        document.removeEventListener("keydown", handleKeyDown, true)
        const index = modalStack.findIndex((entry) => entry.token === token)
        if (index !== -1) modalStack.splice(index, 1)
        unlockBodyScroll()
        if (previouslyFocused && typeof previouslyFocused.focus === "function" && previouslyFocused.isConnected) {
          previouslyFocused.focus({ preventScroll: true })
        }
      }
      // initialFocusRef is read once on open by design
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // Use a ModalTitle, or else the first heading in the dialog, as its accessible name
    React.useEffect(() => {
      if (!open || ariaLabelledBy || ariaLabel) return
      const dialog = dialogRef.current
      if (!dialog) return
      let next: string | undefined
      if (dialog.querySelector(`[id="${titleId}"]`)) {
        next = titleId
      } else {
        const heading = dialog.querySelector<HTMLElement>("h1, h2, h3, h4")
        if (heading) {
          if (!heading.id) heading.id = `${titleId}-heading`
          next = heading.id
        }
      }
      setAutoLabelId((current) => (current === next ? current : next))
      // Re-check when the content changes (e.g. a progress view swaps to results)
    }, [open, ariaLabelledBy, ariaLabel, titleId, children])

    // Only close when the press started and ended on the backdrop itself, so a
    // text selection dragged out of the dialog doesn't dismiss it.
    const pointerDownOnBackdrop = React.useRef(false)

    if (!open) return null

    const labelledBy = ariaLabelledBy ?? (ariaLabel ? undefined : autoLabelId)

    return (
      <div
        className={cn(
          "fixed inset-0 z-50 overflow-y-auto bg-black flex items-center justify-center p-4",
          isNested ? "bg-opacity-30" : "bg-opacity-60 backdrop-blur-sm",
          backdropClassName
        )}
        onMouseDown={(e) => {
          pointerDownOnBackdrop.current = e.target === e.currentTarget
        }}
        onClick={(e) => {
          if (
            closeOnBackdropClick &&
            e.target === e.currentTarget &&
            pointerDownOnBackdrop.current
          ) {
            onClose()
          }
          pointerDownOnBackdrop.current = false
        }}
        {...props}
      >
        <div
          ref={setDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          aria-describedby={ariaDescribedBy}
          tabIndex={-1}
          className={cn(
            "relative bg-white bg-opacity-100 mx-auto rounded-lg shadow-xl p-6 border border-gray-200 max-w-full max-h-[calc(100dvh-2rem)] overflow-y-auto focus:outline-none",
            width,
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ModalNestingContext.Provider value={true}>
            <ModalTitleIdContext.Provider value={titleId}>
              {children}
            </ModalTitleIdContext.Provider>
          </ModalNestingContext.Provider>
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
  id?: string
}

export const ModalTitle = React.forwardRef<HTMLHeadingElement, ModalTitleProps>(
  ({ children, className, id, ...props }, ref) => {
    const contextId = React.useContext(ModalTitleIdContext)
    return (
      <h2
        ref={ref}
        id={id ?? contextId}
        className={cn("text-lg font-semibold text-gray-900", className)}
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
        className={cn("flex flex-wrap gap-3 justify-end", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ModalFooter.displayName = "ModalFooter"
