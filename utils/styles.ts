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
  grayDisabled: "#e5e7eb",
  
  // Border and separator colors
  border: "#dddddd",
  borderGray: "#D1D5DB",
  borderDisabled: "#d1d5db",
  
  // Text colors
  textPrimary: "#1F2937",
  textDisabled: "#9ca3af",
  white: "#ffffff",
  black: "#000000",
  
  // Status colors
  successMedium: "#52B788",
  successLight: "#D1FAE5",
  
  // Highlight colors
  highlightBg: "#FFFBEB",
  highlightBorder: "#FDE68A",
  
  // Tab colors
  tabActive: "#2D6A4F",
  tabInactive: "#cccccc",
  tabText: "#374151",
  tabTextActive: "#ffffff"
} as const;

export const GRADIENTS = {
  // CSS gradient strings for backgrounds
  primary: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)",
  
  // Tailwind gradient classes for ActionButton
  primaryTailwind: "bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]",
  coralTailwind: "bg-gradient-to-r from-[#E76F51] to-[#F4A261]",
  greenTailwind: "bg-gradient-to-r from-[#2D6A4F] to-[#40916C]",
  amberTailwind: "bg-gradient-to-r from-[#F4A261] to-[#E9C46A]",
  darkTailwind: "bg-gradient-to-r from-[#1B4332] to-[#081C15]",
  successTailwind: "bg-gradient-to-r from-[#52B788] to-[#40916C]",
  dangerTailwind: "bg-gradient-to-r from-[#E76F51] to-[#D62828]"
} as const;

export const TRANSITIONS = {
  fast: "transition-all duration-150 ease-in-out"
} as const;
