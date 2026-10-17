import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Database, Trash2, RefreshCw, AlertTriangle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { analyzeLocalStorage, cleanupLocalStorage, type LocalStorageStats, type CleanupOptions } from '@/lib/localStorage-monitor';
import { formatBytes } from '@/lib/format';
import { useClickOutside } from '@/hooks/useClickOutside';

const TYPE_LABELS: Record<string, string> = {
  projects: 'Projects',
  emailQueues: 'Email queues',
  session: 'Session',
  other: 'Other',
};

export function LocalStorageMonitor() {
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const detailsRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { showToast } = useToast();

  function hasNameString(data: unknown): data is { name: string } {
    return typeof data === 'object' && data !== null && 'name' in data && typeof (data as any).name === 'string';
  }

  // Derived values declared before early returns for hook rules
  const hasOldProjects = useMemo(() => {
    if (!stats) return false;
    return stats.byType.projects.items.some(item => {
      if (!item.lastModified) return false;
      const age = (Date.now() - new Date(item.lastModified).getTime()) / (1000 * 60 * 60 * 24);
      return age > 30;
    });
  }, [stats]);
  const hasOldEmailQueues = useMemo(() => {
    if (!stats) return false;
    return stats.byType.emailQueues.items.some(item => {
      if (!item.lastModified) return false;
      const age = (Date.now() - new Date(item.lastModified).getTime()) / (1000 * 60 * 60 * 24);
      return age > 7;
    });
  }, [stats]);
  const isHighUsage = (stats?.quotaUsage ?? 0) > 80;

  const refreshStats = async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const newStats = await analyzeLocalStorage();
      setStats(newStats);
    } catch (error) {
      console.error('Error analyzing localStorage:', error);
      setLoadFailed(true);
      showToast({ message: 'Failed to analyse localStorage', type: 'error', duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const cleanup = async (options: CleanupOptions, label: string) => {
    if (!window.confirm(`${label}: this permanently deletes data. Continue?`)) return;
    setCleaning(true);
    try {
      const result = await cleanupLocalStorage(options);
      showToast({ 
        message: `${label}: Deleted ${result.deletedCount} items, freed ${formatBytes(result.freedSize)}`, 
        type: 'success', 
        duration: 5000 
      });
      
      // Refresh stats after cleanup
      await refreshStats();
    } catch (error) {
      console.error('Error during localStorage cleanup:', error);
      showToast({ message: `${label} failed`, type: 'error', duration: 5000 });
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click outside to close details
  useClickOutside([detailsRef, buttonRef], () => setShowDetails(false), showDetails);

  // Move focus into the breakdown when it opens; Escape closes it from anywhere
  // and hands focus back to the toggle.
  useEffect(() => {
    if (!showDetails) return;
    detailsRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDetails(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showDetails]);

  if (!stats) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 text-gray-700 rounded-lg border" role="status">
        <Database className="w-4 h-4" aria-hidden="true" />
        {loadFailed && !loading ? (
          <>
            <span className="text-sm">Couldn&apos;t load localStorage stats</span>
            <button type="button" onClick={refreshStats} className="text-xs text-blue-600 hover:text-blue-800 underline">
              Retry
            </button>
          </>
        ) : (
          <>
            <span className="text-sm">Loading localStorage…</span>
            <RefreshCw className="w-3 h-3 motion-safe:animate-spin" aria-hidden="true" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* localStorage Summary */}
      <div className={`sm:relative flex items-center gap-2 px-3 py-1 rounded-lg border ${
        isHighUsage ? 'bg-red-50 border-red-200' : 
        stats.quotaUsage > 50 ? 'bg-amber-50 border-amber-200' : 
        'bg-gray-50 border-gray-200'
      }`}>
        <Database className={`w-4 h-4 ${
          isHighUsage ? 'text-red-600' : 
          stats.quotaUsage > 50 ? 'text-amber-600' : 
          'text-gray-600'
        }`} aria-hidden="true" />
        <span className="sr-only">Browser storage used:</span>
        <span className={`text-sm font-medium ${
          isHighUsage ? 'text-red-800' : 
          stats.quotaUsage > 50 ? 'text-amber-800' : 
          'text-gray-700'
        }`}>
          {formatBytes(stats.totalSize)} ({stats.quotaUsage.toFixed(1)}%)
        </span>
        {isHighUsage && <AlertTriangle className="w-3 h-3 text-red-600" aria-label="High usage" />}
        
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-blue-600 hover:text-blue-800 ml-1 w-12"
          aria-expanded={showDetails}
          aria-controls="localStorage-breakdown"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
        
        <button
          type="button"
          onClick={refreshStats}
          disabled={loading}
          className="text-xs text-gray-600 hover:text-gray-800 ml-1"
          aria-label="Refresh localStorage stats"
          title="Refresh"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
        </button>

        {/* Keep showing the last stats, but don't hide a failed refresh */}
        {loadFailed && !loading && (
          <span className="flex items-center gap-1 text-xs text-red-700" role="alert">
            Refresh failed
            <button type="button" onClick={refreshStats} className="text-blue-600 hover:text-blue-800 underline">
              Retry
            </button>
          </span>
        )}

        {/* Detailed Breakdown */}
        {showDetails && (
          <div
            ref={detailsRef}
            role="dialog"
            aria-labelledby="localStorage-breakdown-title"
            tabIndex={-1}
            id="localStorage-breakdown"
            className="absolute bottom-full left-2 right-2 sm:left-auto sm:right-0 mb-2 bg-white text-gray-900 border rounded-lg shadow-lg p-4 z-50 sm:w-96 sm:max-w-lg max-h-[70vh] overflow-y-auto focus:outline-none"
          >
            <div className="space-y-3">
              <h3 id="localStorage-breakdown-title" className="font-semibold text-sm">localStorage Breakdown</h3>
              
              {/* Summary by Type */}
              {Object.entries(stats.byType).map(([type, data]) => {
                if (data.count === 0) return null;
                const typeLabel = TYPE_LABELS[type] ?? type;
                return (
                  <div key={type} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium">{typeLabel}</span>
                      <span className="text-gray-500 ml-1">({data.count} items)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">{formatBytes(data.size)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cleanup({ target: type === 'emailQueues' ? 'email-queues' : type as 'projects' | 'session' | 'other' }, `${typeLabel} cleanup`)}
                        disabled={cleaning}
                        className="h-6 px-2 text-xs"
                        aria-label={`Delete all ${typeLabel.toLowerCase()} entries`}
                        title={`Delete all ${typeLabel.toLowerCase()} entries`}
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              
              {/* Largest Items */}
              {stats.items.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <h4 className="font-medium text-xs text-gray-600 mb-2">Largest Items</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {stats.items.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <div className="flex-1 mr-2">
                          <div className="truncate font-mono text-gray-800" title={item.key}>
                            {item.key}
                          </div>
                          {hasNameString(item.data) && (
                            <div className="text-gray-500 text-xs">
                              {item.data.name}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-gray-700">{formatBytes(item.size)}</div>
                          <div className="text-gray-400 text-xs capitalize">{item.type}</div>
                        </div>
                      </div>
                    ))}
                    {stats.items.length > 5 && (
                      <div className="text-xs text-gray-500">
                        ...and {stats.items.length - 5} more items
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Quota Information */}
              <div className="mt-3 pt-3 border-t">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Storage quota usage:</span>
                  <span>{stats.quotaUsage.toFixed(1)}%</span>
                </div>
                <div
                  className="w-full bg-gray-200 rounded-full h-2 mt-1"
                  role="progressbar"
                  aria-label="Storage quota usage"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(stats.quotaUsage, 100))}
                >
                  <div 
                    className={`h-2 rounded-full ${
                      stats.quotaUsage > 80 ? 'bg-red-500' : 
                      stats.quotaUsage > 50 ? 'bg-amber-500' : 
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(stats.quotaUsage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Cleanup Actions */}
      {(hasOldProjects || hasOldEmailQueues || isHighUsage) && (
        <div className="flex items-center gap-1">
          {hasOldProjects && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cleanup({ target: 'old-projects', olderThanDays: 30 }, 'Old projects cleanup')}
              disabled={cleaning}
              className="text-xs h-7 px-2"
            >
              <Archive className="w-3 h-3 mr-1" aria-hidden="true" />
              Old projects
            </Button>
          )}
          
          {hasOldEmailQueues && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cleanup({ target: 'old-email-queues', olderThanDays: 7 }, 'Old email queues cleanup')}
              disabled={cleaning}
              className="text-xs h-7 px-2"
            >
              <Trash2 className="w-3 h-3 mr-1" aria-hidden="true" />
              Old queues
            </Button>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanup({ target: 'all' }, 'Complete localStorage cleanup')}
            disabled={cleaning}
            className="text-xs h-7 px-2 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-3 h-3 mr-1" aria-hidden="true" />
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
