import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface SplitButtonMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Render a divider line instead of an actionable item */
  separator?: boolean;
}

export interface SplitButtonProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  /** Main button label */
  label: string;
  /** Main button click handler */
  onClick: () => void;
  /** Dropdown menu items */
  menuItems: SplitButtonMenuItem[];
  /** Whether the main button is disabled */
  disabled?: boolean;
  /** Additional className for the button group */
  className?: string;
  /** Button variant - primary or secondary */
  variant?: "primary" | "secondary";
  /** Custom gradient class for the button */
  gradientClass?: string;
  /** Custom solid color for dropdown button */
  dropdownColor?: string;
  /** Custom hover color for dropdown button */
  dropdownHoverColor?: string;
  /** Whether to show dropdown above the button */
  dropUp?: boolean;
  /** Accessible name for the dropdown toggle */
  menuLabel?: string;
}

export const SplitButton = React.forwardRef<HTMLDivElement, SplitButtonProps>(
  ({
    label,
    onClick,
    menuItems,
    disabled = false,
    className,
    variant = "primary",
    gradientClass,
    dropdownColor,
    dropdownHoverColor,
    dropUp = false,
    menuLabel,
    title,
    ...props
  }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const toggleRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const menuId = React.useId();
    const closeMenu = React.useCallback(() => setIsOpen(false), []);
    useClickOutside(dropdownRef, closeMenu, isOpen);

    const getEnabledItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not([disabled])'
        ) ?? []
      );

    const handleMenuKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        setIsOpen(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      // Keep arrow keys from nudging the selected certificate field
      event.stopPropagation();
      const items = getEnabledItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;
      if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
      if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
      if (event.key === "End") next = items.length - 1;
      items[next]?.focus();
    };

    const baseClasses = "relative font-medium transition-all duration-200";
    const enabledClasses = variant === "primary" 
      ? "text-white shadow-lg hover:shadow-xl"
      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50";
    const disabledClasses = "opacity-50 cursor-not-allowed";
    const focusClasses =
      variant === "primary"
        ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900/40"
        : "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1";

    const buttonGroupClasses = cn(
      "inline-flex items-stretch rounded-lg",
      className
    );

    const mainButtonClasses = cn(
      baseClasses,
      "px-4 py-2.5 text-sm rounded-l-lg max-w-[16rem] truncate",
      focusClasses,
      gradientClass || (variant === "primary" ? "bg-gradient-to-r from-blue-600 to-blue-700" : ""),
      disabled ? disabledClasses : enabledClasses
    );

    const dropdownButtonClasses = cn(
      baseClasses,
      "px-2 py-2.5 text-sm rounded-r-lg h-full",
      variant === "primary" ? "border-l border-white/20" : "border-l-0",
      focusClasses,
      disabled ? disabledClasses : enabledClasses
    );

    return (
      <div ref={ref} className={buttonGroupClasses} {...props}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={mainButtonClasses}
          title={title ?? label}
        >
          {label}
        </button>
        <div className="relative flex" ref={dropdownRef}>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && isOpen) {
                e.stopPropagation();
                setIsOpen(false);
              } else if (e.key === "ArrowDown" && isOpen) {
                e.preventDefault();
                e.stopPropagation();
                getEnabledItems()[0]?.focus();
              }
            }}
            disabled={disabled}
            className={dropdownButtonClasses}
            style={{
              backgroundColor: dropdownColor,
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (dropdownHoverColor && !disabled) {
                e.currentTarget.style.backgroundColor = dropdownHoverColor;
              }
            }}
            onMouseLeave={(e) => {
              if (dropdownColor && !disabled) {
                e.currentTarget.style.backgroundColor = dropdownColor;
              }
            }}
            aria-label={menuLabel ?? `More ${label} options`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls={isOpen ? menuId : undefined}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                dropUp && !isOpen && "rotate-180",
                !dropUp && isOpen && "rotate-180",
                dropUp && isOpen && "rotate-0"
              )}
            />
          </button>
          {isOpen && (
            <div className={cn(
              "absolute right-0 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50",
              dropUp ? "bottom-full mb-1" : "top-full mt-1"
            )}>
              <div
                ref={menuRef}
                id={menuId}
                className="py-1"
                role="menu"
                aria-orientation="vertical"
                onKeyDown={handleMenuKeyDown}
              >
                {menuItems.map((item, index) =>
                  item.separator ? (
                    <div
                      key={index}
                      role="separator"
                      className="my-1 border-t border-gray-200"
                    />
                  ) : (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        if (!item.disabled) {
                          item.onClick();
                          setIsOpen(false);
                        }
                      }}
                      disabled={item.disabled}
                      className={cn(
                        "flex items-center gap-2 w-full px-4 py-2 text-sm text-left focus:outline-none",
                        item.disabled
                          ? "text-gray-400 cursor-not-allowed"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:bg-gray-100 focus-visible:text-gray-900"
                      )}
                      role="menuitem"
                    >
                      {item.icon && (
                        <span className="flex-shrink-0" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      {item.label}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SplitButton.displayName = "SplitButton";
