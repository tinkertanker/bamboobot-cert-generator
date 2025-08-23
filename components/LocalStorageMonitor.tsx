import React, { useState, useEffect } from 'react';
import { Database, Trash2, RefreshCw, AlertTriangle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { analyzeLocalStorage, cleanupLocalStorage, formatBytes, type LocalStorageStats, type CleanupOptions } from '@/lib/localStorage-monitor';

export function LocalStorageMonitor() {
  const [stats, setStats] = useState<LocalStorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { showToast } = useToast();

  const refreshStats = async () => {
    setLoading(true);
    try {
      const newStats = await analyzeLocalStorage();
      setStats(newStats);
    } catch (error) {
      console.error('Error analyzing localStorage:', error);
      showToast({ message: 'Failed to analyze localStorage', type: 'error', duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const cleanup = async (options: CleanupOptions, label: string) => {
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

  if (!stats) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-lg border">
        <Database className="w-4 h-4" />
        <span className="text-sm">Loading localStorage...</span>
        {loading && <RefreshCw className="w-3 h-3 animate-spin" />}
      </div>
    );
  }

  const isHighUsage = stats.quotaUsage > 80; // >80% of quota
  const hasOldProjects = stats.byType.projects.items.some(item => {
    if (!item.lastModified) return false;
    const age = (Date.now() - new Date(item.lastModified).getTime()) / (1000 * 60 * 60 * 24);
    return age > 30; // >30 days old
  });
  const hasOldEmailQueues = stats.byType.emailQueues.items.some(item => {
    if (!item.lastModified) return false;
    const age = (Date.now() - new Date(item.lastModified).getTime()) / (1000 * 60 * 60 * 24);
    return age > 7; // >7 days old
  });

  return (
    <div className="flex items-center gap-2">
      {/* localStorage Summary */}
      <div className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border ${
        isHighUsage ? 'bg-red-50 border-red-200' : 
        stats.quotaUsage > 50 ? 'bg-amber-50 border-amber-200' : 
        'bg-gray-50 border-gray-200'
      }`}>
        <Database className={`w-4 h-4 ${
          isHighUsage ? 'text-red-600' : 
          stats.quotaUsage > 50 ? 'text-amber-600' : 
          'text-gray-600'
        }`} />
        <span className={`text-sm font-medium ${
          isHighUsage ? 'text-red-800' : 
          stats.quotaUsage > 50 ? 'text-amber-800' : 
          'text-gray-700'
        }`}>
          {formatBytes(stats.totalSize)} ({stats.quotaUsage.toFixed(1)}%)
        </span>
        {isHighUsage && <AlertTriangle className="w-3 h-3 text-red-600" />}
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-blue-600 hover:text-blue-800 ml-1"
        >
          {showDetails ? 'Hide' : 'Details'}
        </button>
        
        <button
          onClick={refreshStats}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-gray-700 ml-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {/* Detailed Breakdown */}
        {showDetails && (
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="localStorage-breakdown-title"
            tabIndex={-1}
            className="absolute top-full left-0 mt-2 bg-white border rounded-lg shadow-lg p-4 z-50 min-w-[80vw] max-w-[95vw] sm:min-w-96 sm:max-w-lg"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowDetails(false);
              }
            }}
          >
            <div className="space-y-3">
              <h3 id="localStorage-breakdown-title" className="font-semibold text-sm">localStorage Breakdown</h3>
              
              {/* Summary by Type */}
              {Object.entries(stats.byType).map(([type, data]) => {
                if (data.count === 0) return null;
                return (
                  <div key={type} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium capitalize">{type.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="text-gray-500 ml-1">({data.count} items)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-700">{formatBytes(data.size)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cleanup({ target: type === 'emailQueues' ? 'email-queues' : type as 'projects' | 'session' | 'other' }, `${type} cleanup`)}
                        disabled={cleaning}
                        className="h-6 px-2 text-xs"
                      >
                        <Trash2 className="w-3 h-3" />
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
                          {item.data && 'name' in item.data && typeof item.data.name === 'string' && (
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
                  <span>Storage Quota Usage:</span>
                  <span>{stats.quotaUsage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
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
              <Archive className="w-3 h-3 mr-1" />
              Old Projects
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
              <Trash2 className="w-3 h-3 mr-1" />
              Old Queues
            </Button>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanup({ target: 'all' }, 'Complete localStorage cleanup')}
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