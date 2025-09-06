import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, HelpCircle, Clock, Filter } from "lucide-react";
import { COLORS, TRANSITIONS } from "@/utils/styles";
import type { TableData } from "@/types/certificate";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchFilterProps {
  tableData: TableData[];
  onFilteredDataChange: (filteredData: TableData[]) => void;
  columns: string[];
}

interface SearchSuggestion {
  type: 'column' | 'value' | 'syntax' | 'recent';
  text: string;
  display: string;
  description?: string;
}

interface FilterChip {
  id: string;
  label: string;
  filter: (row: TableData) => boolean;
  active: boolean;
}

export function SmartSearchBar({ tableData, onFilteredDataChange, columns }: SearchFilterProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilterChips, setActiveFilterChips] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Debounced search handler for better performance
  const debouncedSetSearchQuery = useDebounce((query: string) => {
    setSearchQuery(query);
  }, 300); // 300ms debounce delay

  // Filter chips configuration
  const filterChips: FilterChip[] = useMemo(() => [
    {
      id: 'has-email',
      label: 'Has Email',
      filter: (row) => columns.some(col => 
        col.toLowerCase().includes('email') && row[col] && row[col].includes('@')
      ),
      active: false
    },
    {
      id: 'missing-data',
      label: 'Missing Data',
      filter: (row) => Object.values(row).some(val => !val || val === ''),
      active: false
    },
    {
      id: 'complete',
      label: 'Complete',
      filter: (row) => Object.values(row).every(val => val && val !== ''),
      active: false
    },
    {
      id: 'long-names',
      label: 'Long Names',
      filter: (row) => columns.some(col => 
        col.toLowerCase().includes('name') && row[col] && row[col].length > 20
      ),
      active: false
    }
  ], [columns]);

  // Parse search query for column:value syntax
  const parseSearchQuery = (query: string) => {
    const filters: { column?: string; value: string }[] = [];
    const regex = /(\w+):("([^"]+)"|([^\s]+))|("[^"]+"|\S+)/g;
    let match;

    while ((match = regex.exec(query)) !== null) {
      if (match[1]) {
        // Column:value syntax
        filters.push({
          column: match[1].toLowerCase(),
          value: (match[3] || match[4]).toLowerCase()
        });
      } else {
        // General search term
        filters.push({
          value: (match[5] || match[0]).replace(/"/g, '').toLowerCase()
        });
      }
    }

    return filters;
  };

  // Generate search suggestions
  const suggestions = useMemo(() => {
    const suggs: SearchSuggestion[] = [];
    const queryLower = searchQuery.toLowerCase();
    const lastWord = searchQuery.split(' ').pop() || '';

    // Show syntax help when focused with empty query
    if (searchQuery === '') {
      suggs.push({
        type: 'syntax',
        text: '',
        display: 'Search syntax',
        description: 'Use column:value to search specific columns'
      });
      suggs.push({
        type: 'syntax',
        text: 'name:"John Doe"',
        display: 'name:"John Doe"',
        description: 'Search for exact phrases with quotes'
      });
    }

    // Column name suggestions
    if (lastWord.includes(':') || (!lastWord.includes(':') && queryLower.length > 0)) {
      columns.forEach(col => {
        if (col.toLowerCase().includes(queryLower) || queryLower === '') {
          suggs.push({
            type: 'column',
            text: `${col.toLowerCase()}:`,
            display: `${col}:`,
            description: `Search in ${col} column`
          });
        }
      });
    }

    // Value suggestions based on column
    const colonIndex = lastWord.indexOf(':');
    if (colonIndex > -1) {
      const columnName = lastWord.substring(0, colonIndex).toLowerCase();
      const valueStart = lastWord.substring(colonIndex + 1).toLowerCase();
      
      const uniqueValues = new Set<string>();
      tableData.forEach(row => {
        const matchingCol = columns.find(col => col.toLowerCase() === columnName);
        if (matchingCol && row[matchingCol]) {
          const value = row[matchingCol].toString();
          if (value.toLowerCase().includes(valueStart)) {
            uniqueValues.add(value);
          }
        }
      });

      Array.from(uniqueValues).slice(0, 5).forEach(value => {
        suggs.push({
          type: 'value',
          text: `${columnName}:"${value}"`,
          display: value,
          description: `in ${columnName}`
        });
      });
    }

    // Recent searches
    if (recentSearches.length > 0 && searchQuery === '') {
      recentSearches.slice(0, 3).forEach(search => {
        suggs.push({
          type: 'recent',
          text: search,
          display: search,
          description: 'Recent search'
        });
      });
    }

    return suggs.slice(0, 8); // Limit suggestions
  }, [searchQuery, columns, tableData, recentSearches]);

  // Filter data based on search and active chips
  useEffect(() => {
    let filtered = [...tableData];

    // Apply search query filters
    if (searchQuery.trim()) {
      const filters = parseSearchQuery(searchQuery);
      filtered = filtered.filter(row => {
        return filters.every(filter => {
          if (filter.column) {
            // Search specific column
            const matchingCol = columns.find(col => col.toLowerCase() === filter.column);
            return matchingCol && row[matchingCol] && 
              row[matchingCol].toString().toLowerCase().includes(filter.value);
          } else {
            // Search all columns
            return Object.values(row).some(val => 
              val && val.toString().toLowerCase().includes(filter.value)
            );
          }
        });
      });
    }

    // Apply active filter chips
    filterChips.forEach(chip => {
      if (activeFilterChips.has(chip.id)) {
        filtered = filtered.filter(chip.filter);
      }
    });

    onFilteredDataChange(filtered);
  }, [searchQuery, activeFilterChips, tableData, columns, filterChips, onFilteredDataChange]);

  // Handle search submission
  const handleSearch = (query: string) => {
    setSearchQuery(query); // Direct update for explicit search actions
    setShowSuggestions(false);
    
    if (query.trim() && !recentSearches.includes(query)) {
      setRecentSearches(prev => [query, ...prev].slice(0, 5));
    }
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'column') {
      setSearchQuery(prev => {
        const words = prev.split(' ');
        words[words.length - 1] = suggestion.text;
        return words.join(' ');
      });
      searchInputRef.current?.focus();
    } else {
      handleSearch(suggestion.text);
    }
  };

  // Handle filter chip toggle
  const toggleFilterChip = (chipId: string) => {
    setActiveFilterChips(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chipId)) {
        newSet.delete(chipId);
      } else {
        newSet.add(chipId);
      }
      return newSet;
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery(""); // Direct update for clear action
    setActiveFilterChips(new Set());
  };

  // Calculate filtered count
  const filteredCount = useMemo(() => {
    let count = tableData.length;
    
    if (searchQuery.trim()) {
      const filters = parseSearchQuery(searchQuery);
      count = tableData.filter(row => {
        return filters.every(filter => {
          if (filter.column) {
            const matchingCol = columns.find(col => col.toLowerCase() === filter.column);
            return matchingCol && row[matchingCol] && 
              row[matchingCol].toString().toLowerCase().includes(filter.value);
          } else {
            return Object.values(row).some(val => 
              val && val.toString().toLowerCase().includes(filter.value)
            );
          }
        });
      }).length;
    }

    filterChips.forEach(chip => {
      if (activeFilterChips.has(chip.id)) {
        count = tableData.filter(chip.filter).length;
      }
    });

    return count;
  }, [searchQuery, activeFilterChips, tableData, columns, filterChips]);

  return (
    <div className="mb-4 space-y-3">
      {/* Smart Search Bar */}
      <div className="relative">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              // Show suggestions immediately for better UX
              setShowSuggestions(true);
              setSelectedSuggestionIndex(-1);
              // Debounce the actual search query update
              debouncedSetSearchQuery(value);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => 
                  prev < suggestions.length - 1 ? prev + 1 : prev
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
              } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
                e.preventDefault();
                handleSuggestionClick(suggestions[selectedSuggestionIndex]);
              } else if (e.key === 'Enter') {
                handleSearch(searchQuery);
              } else if (e.key === 'Escape') {
                setShowSuggestions(false);
              }
            }}
            placeholder="Search all columns or use column:value syntax..."
            className={`w-full pl-10 pr-24 py-2.5 border border-gray-300 rounded-lg text-sm 
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent 
              ${TRANSITIONS.fast}`}
            style={{ backgroundColor: COLORS.white }}
          />
          
          {/* Help Icon */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
            {(searchQuery || activeFilterChips.size > 0) && (
              <button
                onClick={clearAllFilters}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <span className="text-xs text-gray-500 font-medium">
              {filteredCount}/{tableData.length}
            </span>
            <HelpCircle className="h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-20 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
            style={{ maxHeight: '320px' }}
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.text}-${index}`}
                onClick={() => handleSuggestionClick(suggestion)}
                className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 focus:bg-gray-50 
                  focus:outline-none flex items-center justify-between group
                  ${selectedSuggestionIndex === index ? 'bg-gray-50' : ''}
                  ${TRANSITIONS.fast}`}
              >
                <div className="flex items-center gap-3">
                  {suggestion.type === 'column' && (
                    <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-blue-600">C</span>
                    </div>
                  )}
                  {suggestion.type === 'value' && (
                    <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-green-600">V</span>
                    </div>
                  )}
                  {suggestion.type === 'syntax' && (
                    <HelpCircle className="h-4 w-4 text-gray-400" />
                  )}
                  {suggestion.type === 'recent' && (
                    <Clock className="h-4 w-4 text-gray-400" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {suggestion.display}
                    </div>
                    {suggestion.description && (
                      <div className="text-xs text-gray-500">{suggestion.description}</div>
                    )}
                  </div>
                </div>
                {suggestion.type === 'column' && (
                  <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Press to continue
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Filter className="h-4 w-4" />
          <span>Quick filters:</span>
        </div>
        {filterChips.map(chip => (
          <button
            key={chip.id}
            onClick={() => toggleFilterChip(chip.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
              ${activeFilterChips.has(chip.id)
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Active Filter Summary */}
      {(searchQuery || activeFilterChips.size > 0) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Showing:</span>
          <span className="font-medium text-gray-900">
            {filteredCount} of {tableData.length} entries
          </span>
          {searchQuery && (
            <span className="text-gray-500">
              matching &ldquo;{searchQuery}&rdquo;
            </span>
          )}
          {activeFilterChips.size > 0 && (
            <span className="text-gray-500">
              with {activeFilterChips.size} filter{activeFilterChips.size > 1 ? 's' : ''} applied
            </span>
          )}
        </div>
      )}
    </div>
  );
}