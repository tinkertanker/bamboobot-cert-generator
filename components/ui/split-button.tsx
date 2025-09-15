import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";

export interface SplitButtonMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SplitButtonProps {
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
    ...props
  }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

    const baseClasses = "relative font-medium transition-all duration-200";
    const enabledClasses = variant === "primary" 
      ? "text-white shadow-lg hover:shadow-xl"
      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50";
    const disabledClasses = "opacity-50 cursor-not-allowed";

    const buttonGroupClasses = cn(
      "inline-flex items-stretch rounded-lg",
      className
    );

    const mainButtonClasses = cn(
      baseClasses,
      "px-4 py-2.5 text-sm rounded-l-lg focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-0",
      gradientClass || (variant === "primary" ? "bg-gradient-to-r from-blue-600 to-blue-700" : ""),
      disabled ? disabledClasses : enabledClasses
    );

    const dropdownButtonClasses = cn(
      baseClasses,
      "px-2 py-2.5 text-sm rounded-r-lg border-l border-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-0 h-full",
      disabled ? disabledClasses : enabledClasses
    );

    return (
      <div ref={ref} className={buttonGroupClasses} {...props}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={mainButtonClasses}
        >
          {label}
        </button>
        <div className="relative flex" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
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
            aria-haspopup="true"
            aria-expanded={isOpen}
          >
            <ChevronDown
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
              "absolute right-0 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50",
              dropUp ? "bottom-full mb-1" : "top-full mt-1"
            )}>
              <div className="py-1" role="menu" aria-orientation="vertical">
                {menuItems.map((item, index) => (
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
                      "flex items-center gap-2 w-full px-4 py-2 text-sm text-left",
                      item.disabled
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    )}
                    role="menuitem"
                  >
                    {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SplitButton.displayName = "SplitButton";
