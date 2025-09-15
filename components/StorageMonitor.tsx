import React, { useState, useEffect, useRef } from 'react';
import { HardDrive, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface FileInfo {
  name: string;
  size: number;
  age: number;
  type: 'pdf' | 'image' | 'progressive' | 'other';
}

interface DirectoryStats {
  path: string;
  totalSize: number;
  fileCount: number;
  files: FileInfo[];
}

interface StorageStats {
  totalSize: number;
  directories: {
    generated: DirectoryStats;
    tempImages: DirectoryStats;
    dockerData?: DirectoryStats;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function StorageMonitor() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/storage-stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching storage stats:', error);
      showToast({ message: 'Failed to fetch storage stats', type: 'error', duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const cleanup = async (target: string, label: string) => {
    setCleaning(true);
    try {
      const response = await fetch('/api/dev-cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      
      if (!response.ok) throw new Error('Cleanup failed');
      
      const result = await response.json();
      showToast({ message: `${label}: ${result.message}`, type: 'success', duration: 5000 });
      
      // Refresh stats after cleanup
      await fetchStats();
    } catch (error) {
      console.error('Error during cleanup:', error);
      showToast({ message: `${label} failed`, type: 'error', duration: 5000 });
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle click outside to close details
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showDetails &&
        detailsRef.current &&
        !detailsRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowDetails(false);
      }
    };

    if (showDetails) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDetails]);

  if (!stats) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg border">
        <HardDrive className="w-4 h-4" />
        <span className="text-sm">Loading storage...</span>
        {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
      </div>
    );
  }

  const isHighUsage = stats.totalSize > 100 * 1024 * 1024; // > 100MB
  const largePdfs = stats.directories.generated.files.filter(f => 
    f.type === 'pdf' && f.size > 1024 * 1024 // > 1MB
  );

  return (
    <div className="flex items-center gap-2">
      {/* Storage Summary */}
      <div className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border ${
        isHighUsage ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <HardDrive className={`w-4 h-4 ${isHighUsage ? 'text-amber-600' : 'text-gray-600'}`} />
        <span className={`text-sm font-medium ${isHighUsage ? 'text-amber-800' : 'text-gray-700'}`}>
          {formatBytes(stats.totalSize)}
        </span>
        {isHighUsage && <AlertTriangle className="w-3 h-3 text-amber-600" />}
        
        <button
          ref={buttonRef}
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-blue-600 hover:text-blue-800 ml-1 w-12"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
        
        <button
          onClick={fetchStats}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-700 ml-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Detailed Breakdown */}
        {showDetails && (
          <div
            ref={detailsRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="storage-breakdown-title"
            tabIndex={-1}
            className="absolute bottom-full right-0 mb-2 bg-white border rounded-lg shadow-lg p-4 z-50 min-w-[80vw] max-w-[95vw] sm:min-w-96 sm:max-w-lg"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowDetails(false);
              }
            }}
          >
            <div className="space-y-3">
              <h3 id="storage-breakdown-title" className="font-semibold text-sm">Storage Breakdown</h3>
              
              {Object.entries(stats.directories).map(([key, dir]) => {
                if (!dir) return null;
                return (
                  <div key={key} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-gray-500 ml-1">({dir.fileCount} items)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">{formatBytes(dir.totalSize)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cleanup(key === 'dockerData' ? 'docker' : key, `${key} cleanup`)}
                        disabled={cleaning}
                        className="h-6 px-2 text-xs"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              
              {/* Large Files List */}
              {largePdfs.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <h4 className="font-medium text-xs text-gray-600 mb-2">Large PDF Files (&gt;1MB)</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {largePdfs.slice(0, 5).map((file, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="truncate flex-1 mr-2" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-gray-500">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                    {largePdfs.length > 5 && (
                      <div className="text-xs text-gray-500">
                        ...and {largePdfs.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Cleanup Actions */}
      {(isHighUsage || largePdfs.length > 0) && (
        <div className="flex items-center gap-1">
          {largePdfs.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cleanup('large-pdfs', 'Large PDFs cleanup')}
              disabled={cleaning}
              className="text-xs h-7 px-2"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Large PDFs ({largePdfs.length})
            </Button>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanup('old', 'Old files cleanup')}
            disabled={cleaning}
            className="text-xs h-7 px-2"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Old Files
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanup('all', 'Complete cleanup')}
            disabled={cleaning}
            className="text-xs h-7 px-2 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}