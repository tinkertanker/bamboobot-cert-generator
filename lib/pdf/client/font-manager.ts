/**
 * Client-side font manager for PDF generation
 * Handles font loading, caching, and memory management
 */

import { StandardFonts } from 'pdf-lib';

export type FontFamily = 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 
  'SourceSansPro' | 'Nunito' | 'GreatVibes' | 'Archivo' | 'Rubik';

export type FontStyle = {
  bold?: boolean;
  italic?: boolean;
};

interface FontVariant {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

interface FontCacheEntry {
  data: ArrayBuffer;
  lastAccessed: number;
}

const FONT_CACHE_NAME = 'bamboobot-fonts-v1';
const FONT_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const MEMORY_CACHE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB

export class FontManager {
  private static instance: FontManager;
  private memoryCache: Map<string, FontCacheEntry> = new Map();
  private memoryCacheSize = 0;
  private fontBaseUrl = '/fonts/';
  
  private constructor() {}

  static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  /**
   * Get the font file path for a specific variant
   */
  private getFontPath(family: FontFamily, bold: boolean, italic: boolean): string | null {
    const fontMap: Record<string, string> = {
      // Standard fonts (handled by pdf-lib)
      'Helvetica-regular': StandardFonts.Helvetica,
      'Helvetica-bold': StandardFonts.HelveticaBold,
      'Helvetica-italic': StandardFonts.HelveticaOblique,
      'Helvetica-bold-italic': StandardFonts.HelveticaBoldOblique,
      'Times-regular': StandardFonts.TimesRoman,
      'Times-bold': StandardFonts.TimesRomanBold,
      'Times-italic': StandardFonts.TimesRomanItalic,
      'Times-bold-italic': StandardFonts.TimesRomanBoldItalic,
      'Courier-regular': StandardFonts.Courier,
      'Courier-bold': StandardFonts.CourierBold,
      'Courier-italic': StandardFonts.CourierOblique,
      'Courier-bold-italic': StandardFonts.CourierBoldOblique,
      
      // Custom fonts
      'Montserrat-regular': 'Montserrat-Regular.ttf',
      'Montserrat-bold': 'Montserrat-Bold.ttf',
      'Poppins-regular': 'Poppins-Regular.ttf',
      'Poppins-bold': 'Poppins-Bold.ttf',
      'Poppins-italic': 'Poppins-Italic.ttf',
      'Poppins-bold-italic': 'Poppins-BoldItalic.ttf',
      'SourceSansPro-regular': 'SourceSansPro-Regular.ttf',
      'SourceSansPro-bold': 'SourceSansPro-Bold.ttf',
      'SourceSansPro-italic': 'SourceSansPro-Italic.ttf',
      'SourceSansPro-bold-italic': 'SourceSansPro-BoldItalic.ttf',
      'Nunito-regular': 'Nunito-Regular.ttf',
      'Nunito-bold': 'Nunito-Bold.ttf',
      'Nunito-italic': 'Nunito-Italic.ttf',
      'Nunito-bold-italic': 'Nunito-BoldItalic.ttf',
      'GreatVibes-regular': 'GreatVibes-Regular.ttf',
      'Archivo-regular': 'Archivo-Regular.ttf',
      'Archivo-bold': 'Archivo-Bold.ttf',
      'Archivo-italic': 'Archivo-Italic.ttf',
      'Archivo-bold-italic': 'Archivo-BoldItalic.ttf',
      'Rubik-regular': 'Rubik-Regular.ttf',
      'Rubik-bold': 'Rubik-Bold.ttf',
      'Rubik-italic': 'Rubik-Italic.ttf',
      'Rubik-bold-italic': 'Rubik-BoldItalic.ttf',
    };

    const key = `${family}-${bold ? 'bold' : 'regular'}${italic ? '-italic' : ''}`;
    return fontMap[key] || null;
  }

  /**
   * Check if a font is a standard font (built into pdf-lib)
   */
  isStandardFont(family: FontFamily): boolean {
    return ['Helvetica', 'Times', 'Courier'].includes(family);
  }

  /**
   * Generate a cache key for a font variant
   */
  private getCacheKey(family: FontFamily, bold: boolean, italic: boolean): string {
    return `${family}-${bold ? 'bold' : 'regular'}${italic ? '-italic' : ''}`;
  }

  /**
   * Load font data from network
   */
  private async loadFontFromNetwork(fontPath: string): Promise<ArrayBuffer> {
    const response = await fetch(this.fontBaseUrl + fontPath);
    if (!response.ok) {
      throw new Error(`Failed to load font: ${fontPath}`);
    }
    return response.arrayBuffer();
  }

  /**
   * Get font data from IndexedDB cache
   */
  private async getFromIndexedDB(key: string): Promise<ArrayBuffer | null> {
    if (!('indexedDB' in window)) {
      return null;
    }

    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(['fonts'], 'readonly');
      const store = tx.objectStore('fonts');
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result && Date.now() - result.timestamp < FONT_CACHE_MAX_AGE) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('IndexedDB access failed:', error);
      return null;
    }
  }

  /**
   * Store font data in IndexedDB cache
   */
  private async storeInIndexedDB(key: string, data: ArrayBuffer): Promise<void> {
    if (!('indexedDB' in window)) {
      return;
    }

    try {
      const db = await this.openIndexedDB();
      const tx = db.transaction(['fonts'], 'readwrite');
      const store = tx.objectStore('fonts');
      store.put({
        key,
        data,
        timestamp: Date.now()
      }, key);
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('Failed to store font in IndexedDB:', error);
    }
  }

  /**
   * Open IndexedDB for font caching
   */
  private async openIndexedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FONT_CACHE_NAME, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('fonts')) {
          db.createObjectStore('fonts');
        }
      };
    });
  }

  /**
   * Manage memory cache size
   */
  private evictFromMemoryCache(): void {
    if (this.memoryCacheSize <= MEMORY_CACHE_SIZE_LIMIT) {
      return;
    }

    // Sort by last accessed time and remove oldest entries
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    while (this.memoryCacheSize > MEMORY_CACHE_SIZE_LIMIT * 0.8 && entries.length > 0) {
      const [key, entry] = entries.shift()!;
      this.memoryCache.delete(key);
      this.memoryCacheSize -= entry.data.byteLength;
    }
  }

  /**
   * Load a font for use in PDF generation
   */
  async loadFont(family: FontFamily, bold = false, italic = false): Promise<ArrayBuffer | string> {
    // For standard fonts, return the constant name
    if (this.isStandardFont(family)) {
      const fontPath = this.getFontPath(family, bold, italic);
      if (fontPath && fontPath.startsWith('Helvetica') || 
          fontPath?.startsWith('Times') || 
          fontPath?.startsWith('Courier')) {
        return fontPath;
      }
    }

    const cacheKey = this.getCacheKey(family, bold, italic);
    
    // Check memory cache
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry) {
      memoryEntry.lastAccessed = Date.now();
      return memoryEntry.data;
    }

    // Check IndexedDB
    const cachedData = await this.getFromIndexedDB(cacheKey);
    if (cachedData) {
      // Add to memory cache
      this.memoryCache.set(cacheKey, {
        data: cachedData,
        lastAccessed: Date.now()
      });
      this.memoryCacheSize += cachedData.byteLength;
      this.evictFromMemoryCache();
      return cachedData;
    }

    // Load from network
    const fontPath = this.getFontPath(family, bold, italic);
    if (!fontPath) {
      throw new Error(`Font not found: ${family} (bold: ${bold}, italic: ${italic})`);
    }

    const fontData = await this.loadFontFromNetwork(fontPath);
    
    // Store in caches
    this.memoryCache.set(cacheKey, {
      data: fontData,
      lastAccessed: Date.now()
    });
    this.memoryCacheSize += fontData.byteLength;
    this.evictFromMemoryCache();
    
    await this.storeInIndexedDB(cacheKey, fontData);
    
    return fontData;
  }

  /**
   * Preload commonly used fonts
   */
  async preloadFonts(fonts: FontVariant[]): Promise<void> {
    const loadPromises = fonts.map(font => 
      this.loadFont(font.family, font.bold, font.italic).catch(err => {
        console.warn(`Failed to preload font ${font.family}:`, err);
      })
    );
    
    await Promise.all(loadPromises);
  }

  /**
   * Clear font caches
   */
  async clearCache(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    this.memoryCacheSize = 0;
    
    // Clear IndexedDB
    if ('indexedDB' in window) {
      try {
        await indexedDB.deleteDatabase(FONT_CACHE_NAME);
      } catch (error) {
        console.warn('Failed to clear IndexedDB cache:', error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCacheSize,
      memoryCacheEntries: this.memoryCache.size,
      memoryCacheSizeLimit: MEMORY_CACHE_SIZE_LIMIT
    };
  }
}