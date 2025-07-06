export const DEFAULT_FONT_SIZE = 24;

// Font capabilities configuration
export const FONT_CAPABILITIES = {
  Helvetica: { bold: true, italic: true },
  Times: { bold: true, italic: true },
  Courier: { bold: true, italic: true },
  Montserrat: { bold: true, italic: false }, // Has bold but no italic files
  Poppins: { bold: true, italic: true }, // Complete font family - geometric with personality
  WorkSans: { bold: true, italic: true }, // Complete font family - clean with character
  Roboto: { bold: true, italic: true }, // Google's flagship - excellent kerning
  SourceSansPro: { bold: true, italic: true }, // Adobe's masterpiece - professional typography
  Nunito: { bold: true, italic: true }, // Friendly rounded - good spacing
  GreatVibes: { bold: false, italic: false } // Elegant script - single weight only
} as const;