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