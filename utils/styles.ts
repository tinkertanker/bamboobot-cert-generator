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
  
  // Border and separator colors
  border: "#dddddd",
  borderGray: "#D1D5DB",
  borderDark: "#6B7280",
  
  // Text colors
  textPrimary: "#1F2937",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  
  // Status colors
  success: "#10B981",
  successLight: "#D1FAE5",
  successDark: "#047857",
  error: "#EF4444",
  errorLight: "#FEE2E2",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  
  // Tab colors
  tabActive: "#2D6A4F",
  tabInactive: "#cccccc",
  tabText: "#374151",
  tabTextActive: "#ffffff"
} as const;

export const GRADIENTS = {
  primary: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
  coral: "linear-gradient(135deg, #E76F51 0%, #D86444 100%)",
  amber: "linear-gradient(135deg, #F4A261 0%, #E5935A 100%)"
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