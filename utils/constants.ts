export const DEFAULT_FONT_SIZE = 24;

// Font capabilities configuration
export const FONT_CAPABILITIES = {
  Helvetica: { bold: true, italic: true },
  Times: { bold: true, italic: true },
  Courier: { bold: true, italic: true },
  Montserrat: { bold: true, italic: false }, // Has bold but no italic files
  Poppins: { bold: true, italic: true }, // Complete font family - geometric with personality
  SourceSansPro: { bold: true, italic: true }, // Adobe's masterpiece - professional typography
  Nunito: { bold: true, italic: true }, // Friendly rounded - good spacing
  GreatVibes: { bold: false, italic: false } // Elegant script - single weight only
} as const;

// Progressive PDF Generation constants
export const PROGRESSIVE_PDF = {
  DEFAULT_BATCH_SIZE: 20,
  AUTO_PROGRESSIVE_THRESHOLD: 100, // Use progressive generation for datasets > 100 entries
  POLL_INTERVAL_MS: 1000, // Poll progress every second
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_RETRIES: 3,
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000 // Cleanup expired sessions every hour
} as const;

// Split Button Theme Configuration
export const SPLIT_BUTTON_THEME = {
  templates: {
    gradient: "bg-gradient-to-r from-purple-600 to-purple-500",
    dropdownColor: "#8B5CF6", // purple-500 - matches gradient end
    dropdownHoverColor: "#7C3AED" // purple-600 - darker on hover
  },
  generate: {
    gradient: "bg-gradient-to-r from-[#E76F51] to-[#F4A261]",
    dropdownColor: "#F4A261", // amber matching gradient end
    dropdownHoverColor: "#D97706" // amber-600 - darker on hover
  }
} as const;

// Autosave Configuration
export const AUTOSAVE = {
  DEBOUNCE_MS: 2000, // 2 seconds
  TOAST_DURATION_MS: 2000,
  SESSION_NAME_FORMAT: "Session MM/DD/YYYY HH:MM"
} as const;

// Toast Configuration
export const TOAST = {
  DEFAULT_DURATION_MS: 3000,
  POSITION: "bottom-4 right-4",
  ANIMATION: "animate-slide-in"
} as const;