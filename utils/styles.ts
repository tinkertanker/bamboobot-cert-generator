// Centralized style constants for the certificate generator

export const COLORS = {
  // Primary brand colors
  primary: "#1B4332",
  primaryMedium: "#2D6A4F", 
  coral: "#E76F51",
  amber: "#F4A261",
  
  // Background and surface colors
  background: "#F5F1E8",
  cardBg: "#FFFEF7",
  grayLight: "#F9FAFB",
  gray50: "#F3F4F6",
  gray100: "#E5E7EB",
  grayDisabled: "#e5e7eb",
  grayMuted: "#9ca3af",
  
  // Border and separator colors
  border: "#dddddd",
  borderGray: "#D1D5DB",
  borderDisabled: "#d1d5db",
  borderDark: "#6B7280",
  
  // Text colors
  textPrimary: "#1F2937",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  textDisabled: "#9ca3af",
  textActive: "#374151",
  white: "#ffffff",
  black: "#000000",
  
  // Status colors
  success: "#10B981",
  successMedium: "#52B788",
  successLight: "#D1FAE5",
  successDark: "#047857",
  error: "#EF4444",
  errorDark: "#DC2626",
  errorRed: "#dc2626",
  errorLight: "#FEE2E2",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  amber900: "#92400e",
  
  // Highlight colors
  highlightBg: "#FFFBEB",
  highlightBorder: "#FDE68A",
  
  // Tab colors
  tabActive: "#2D6A4F",
  tabInactive: "#cccccc",
  tabText: "#374151",
  tabTextActive: "#ffffff",
  
  // Special UI colors
  spinnerBlue: "#3498db"
} as const;

export const GRADIENTS = {
  // CSS gradient strings for backgrounds
  primary: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
  coral: "linear-gradient(135deg, #E76F51 0%, #D86444 100%)",
  amber: "linear-gradient(135deg, #F4A261 0%, #E5935A 100%)",
  
  // Tailwind gradient classes for ActionButton
  primaryTailwind: "bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]",
  coralTailwind: "bg-gradient-to-r from-[#E76F51] to-[#F4A261]",
  greenTailwind: "bg-gradient-to-r from-[#2D6A4F] to-[#40916C]",
  amberTailwind: "bg-gradient-to-r from-[#F4A261] to-[#E9C46A]",
  darkTailwind: "bg-gradient-to-r from-[#1B4332] to-[#081C15]",
  successTailwind: "bg-gradient-to-r from-[#52B788] to-[#40916C]",
  dangerTailwind: "bg-gradient-to-r from-[#E76F51] to-[#D62828]"
} as const;

export const MODAL_STYLES = {
  backdrop: "fixed inset-0 z-50 overflow-auto bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center",
  container: "relative bg-white bg-opacity-100 w-3/4 max-w-6xl mx-auto rounded-lg shadow-xl p-6 border border-gray-200",
  closeButton: "absolute top-4 right-4 text-gray-500 hover:text-gray-700"
} as const;

export const BUTTON_STYLES = {
  primary: {
    backgroundColor: COLORS.primaryMedium,
    borderColor: COLORS.primaryMedium,
    color: "white"
  },
  coral: {
    backgroundColor: COLORS.coral,
    borderColor: COLORS.coral, 
    color: "white"
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: COLORS.borderGray,
    color: COLORS.textSecondary
  },
  outlinePrimary: {
    backgroundColor: "transparent",
    borderColor: COLORS.primaryMedium,
    color: COLORS.primaryMedium
  }
} as const;

export const SHADOWS = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
} as const;

export const TRANSITIONS = {
  fast: "transition-all duration-150 ease-in-out",
  normal: "transition-all duration-200 ease-in-out", 
  slow: "transition-all duration-300 ease-in-out"
} as const;

export const LAYOUT = {
  header: {
    background: GRADIENTS.primary,
    boxShadow: "0 2px 4px rgba(27, 67, 50, 0.1)"
  },
  main: {
    gridCols: "[60%_40%]",
    gap: "gap-6",
    padding: "p-6"
  },
  sidebar: {
    marginRight: "mr-6"
  }
} as const;