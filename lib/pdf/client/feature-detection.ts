/**
 * Feature detection for client-side PDF generation capabilities
 */

export interface BrowserCapabilities {
  webWorker: boolean;
  indexedDB: boolean;
  arrayBuffer: boolean;
  fetch: boolean;
  memoryEstimate: boolean;
  sufficientMemory: boolean;
  overallSupport: boolean;
}

export interface MemoryInfo {
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
  deviceMemory?: number;
  available?: boolean;
}

// Minimum requirements
const MIN_HEAP_SIZE = 512 * 1024 * 1024; // 512MB
const MIN_DEVICE_MEMORY = 2; // 2GB

export class FeatureDetector {
  private static instance: FeatureDetector;
  private capabilities: BrowserCapabilities | null = null;

  private constructor() {}

  static getInstance(): FeatureDetector {
    if (!FeatureDetector.instance) {
      FeatureDetector.instance = new FeatureDetector();
    }
    return FeatureDetector.instance;
  }

  /**
   * Check if the browser supports all required features for client-side PDF generation
   */
  async checkCapabilities(): Promise<BrowserCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    const capabilities: BrowserCapabilities = {
      webWorker: this.checkWebWorkerSupport(),
      indexedDB: this.checkIndexedDBSupport(),
      arrayBuffer: this.checkArrayBufferSupport(),
      fetch: this.checkFetchSupport(),
      memoryEstimate: this.checkMemoryEstimateSupport(),
      sufficientMemory: await this.checkSufficientMemory(),
      overallSupport: false
    };

    // Overall support requires all critical features
    capabilities.overallSupport = 
      capabilities.webWorker &&
      capabilities.arrayBuffer &&
      capabilities.fetch &&
      capabilities.sufficientMemory;

    this.capabilities = capabilities;
    return capabilities;
  }

  /**
   * Check Web Worker support
   */
  private checkWebWorkerSupport(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Check IndexedDB support
   */
  private checkIndexedDBSupport(): boolean {
    try {
      return 'indexedDB' in window && indexedDB !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check ArrayBuffer support
   */
  private checkArrayBufferSupport(): boolean {
    return typeof ArrayBuffer !== 'undefined';
  }

  /**
   * Check Fetch API support
   */
  private checkFetchSupport(): boolean {
    return typeof fetch !== 'undefined';
  }

  /**
   * Check if memory estimation APIs are available
   */
  private checkMemoryEstimateSupport(): boolean {
    return 'storage' in navigator && 'estimate' in navigator.storage ||
           'deviceMemory' in navigator ||
           'memory' in performance;
  }

  /**
   * Check if device has sufficient memory
   */
  private async checkSufficientMemory(): Promise<boolean> {
    const memory = await this.getMemoryInfo();
    
    if (!memory.available) {
      // If we can't determine memory, assume it's sufficient
      return true;
    }

    // Check device memory if available
    if (memory.deviceMemory !== undefined) {
      return memory.deviceMemory >= MIN_DEVICE_MEMORY;
    }

    // Check heap size limit if available
    if (memory.jsHeapSizeLimit !== undefined) {
      return memory.jsHeapSizeLimit >= MIN_HEAP_SIZE;
    }

    // Default to true if we can't determine
    return true;
  }

  /**
   * Get detailed memory information
   */
  async getMemoryInfo(): Promise<MemoryInfo> {
    const info: MemoryInfo = {
      available: false
    };

    // Try navigator.deviceMemory (Chrome)
    if ('deviceMemory' in navigator) {
      info.deviceMemory = (navigator as unknown as { deviceMemory: number }).deviceMemory;
      info.available = true;
    }

    // Try performance.memory (Chrome)
    if ('memory' in performance) {
      const memory = (performance as unknown as { memory: { totalJSHeapSize: number; usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (memory) {
        info.totalJSHeapSize = memory.totalJSHeapSize;
        info.usedJSHeapSize = memory.usedJSHeapSize;
        info.jsHeapSizeLimit = memory.jsHeapSizeLimit;
        info.available = true;
      }
    }

    // Try storage.estimate (modern browsers)
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        // This gives us storage quota, not memory, but can be indicative
        if (estimate.quota && estimate.quota > 1024 * 1024 * 1024) {
          info.available = true;
        }
      } catch {
        // Ignore errors
      }
    }

    return info;
  }

  /**
   * Check if a specific number of rows can be handled client-side
   */
  async canHandleDataSize(rowCount: number, averageRowComplexity = 1): Promise<boolean> {
    // Rough estimation: each certificate takes about 100KB-500KB depending on complexity
    const estimatedMemoryPerCert = 100 * 1024 * averageRowComplexity; // 100KB base
    const totalEstimatedMemory = rowCount * estimatedMemoryPerCert;
    
    const memory = await this.getMemoryInfo();
    
    if (!memory.available) {
      // Conservative limit if we can't determine memory
      return rowCount <= 100;
    }

    if (memory.jsHeapSizeLimit) {
      // Use only 40% of available heap to leave room for other operations
      const availableMemory = (memory.jsHeapSizeLimit - (memory.usedJSHeapSize || 0)) * 0.4;
      return totalEstimatedMemory < availableMemory;
    }

    if (memory.deviceMemory) {
      // Rough estimation based on device memory
      const maxRows = memory.deviceMemory * 50; // 50 rows per GB
      return rowCount <= maxRows;
    }

    // Default conservative limit
    return rowCount <= 100;
  }

  /**
   * Get recommended batch size based on available memory
   */
  async getRecommendedBatchSize(): Promise<number> {
    const memory = await this.getMemoryInfo();
    
    if (!memory.available) {
      return 10; // Conservative default
    }

    if (memory.deviceMemory) {
      // Scale batch size with device memory
      return Math.min(50, Math.max(10, memory.deviceMemory * 10));
    }

    if (memory.jsHeapSizeLimit) {
      // Scale based on heap size
      const heapGB = memory.jsHeapSizeLimit / (1024 * 1024 * 1024);
      return Math.min(50, Math.max(10, Math.floor(heapGB * 20)));
    }

    return 20; // Default batch size
  }

  /**
   * Clear cached capabilities (useful for testing)
   */
  clearCache(): void {
    this.capabilities = null;
  }

  /**
   * Get a human-readable report of capabilities
   */
  async getCapabilityReport(): Promise<string> {
    const caps = await this.checkCapabilities();
    const memory = await this.getMemoryInfo();
    
    const report = [
      '=== Browser Capability Report ===',
      `Web Worker Support: ${caps.webWorker ? '✅' : '❌'}`,
      `IndexedDB Support: ${caps.indexedDB ? '✅' : '❌'} (optional)`,
      `ArrayBuffer Support: ${caps.arrayBuffer ? '✅' : '❌'}`,
      `Fetch API Support: ${caps.fetch ? '✅' : '❌'}`,
      `Memory Estimation Available: ${caps.memoryEstimate ? '✅' : '❌'}`,
      `Sufficient Memory: ${caps.sufficientMemory ? '✅' : '❌'}`,
      '',
      '=== Memory Information ===',
    ];

    if (memory.available) {
      if (memory.deviceMemory !== undefined) {
        report.push(`Device Memory: ${memory.deviceMemory}GB`);
      }
      if (memory.jsHeapSizeLimit !== undefined) {
        report.push(`JS Heap Limit: ${Math.round(memory.jsHeapSizeLimit / (1024 * 1024))}MB`);
      }
      if (memory.usedJSHeapSize !== undefined) {
        report.push(`JS Heap Used: ${Math.round(memory.usedJSHeapSize / (1024 * 1024))}MB`);
      }
    } else {
      report.push('Memory information not available');
    }

    report.push(
      '',
      `=== Overall Support: ${caps.overallSupport ? '✅ Ready' : '❌ Not Supported'} ===`
    );

    return report.join('\n');
  }
}