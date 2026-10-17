import React, { useState, useRef, useEffect, useMemo, useCallback, useId } from "react";
import { Search, X, HelpCircle, Clock, Filter } from "lucide-react";
import { COLORS, TRANSITIONS } from "@/utils/styles";
import type { TableData } from "@/types/certificate";

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
}

const SEARCH_DEBOUNCE_MS = 300;

// Column names are compared ignoring case, spaces, underscores, hyphens and dots, so
// "First Name", "first_name" and "firstname" all refer to the same column.
const normaliseColumnName = (name: string) =>
  name.toLowerCase().replace(/[\s_.-]+/g, '');

export const findColumn = (columns: string[], name: string) => {
  const target = normaliseColumnName(name);
  if (!target) return undefined;
  return (
    columns.find(col => col.toLowerCase() === name.toLowerCase()) ||
    columns.find(col => normaliseColumnName(col) === target)
  );
};

// How a column is written in a query: quoted when it contains whitespace.
export const formatColumnToken = (column: string) =>
  /\s/.test(column) ? `"${column.toLowerCase()}"` : column.toLowerCase();

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The token being typed at the end of the input, e.g. `"first name":jo`.
export const getLastToken = (input: string) =>
  input.match(/(?:"[^"]*"?:?\S*|\S+)$/)?.[0] ?? '';

// Parse search query for column:value syntax. Columns may be quoted
// ("first name":john) or written as-is when they match a known column
// (First Name:john).
export const parseSearchQuery = (query: string, columns: string[] = []) => {
  let prepared = query;
  // Quote known multi-word column names that are typed without quotes
  columns
    .filter(col => /\s/.test(col))
    .sort((a, b) => b.length - a.length)
    .forEach(col => {
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(col)}\\s*:`, 'gi');
      prepared = prepared.replace(pattern, (_m, lead) => `${lead}"${col}":`);
    });

  const filters: { column?: string; value: string }[] = [];
  const regex = /(?:"([^"]+)"|([^\s:"]+)):(?:"([^"]*)"|(\S*))|"([^"]+)"|(\S+)/g;
  let match;

  while ((match = regex.exec(prepared)) !== null) {
    const column = match[1] ?? match[2];
    if (column !== undefined) {
      // Column:value syntax
      filters.push({
        column: column.toLowerCase(),
        value: (match[3] ?? match[4] ?? '').toLowerCase()
      });
    } else {
      // General search term
      filters.push({
        value: (match[5] ?? match[6] ?? '').replace(/"/g, '').toLowerCase()
      });
    }
  }

  return filters;
};

export function SmartSearchBar({ tableData, onFilteredDataChange, columns }: SearchFilterProps) {
  // inputValue drives the text box immediately; searchQuery is the debounced
  // value used for filtering so typing stays responsive on large tables.
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeFilterChips, setActiveFilterChips] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Apply a query immediately (cancelling any pending debounced update)
  const applyQuery = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setInputValue(query);
    setSearchQuery(query);
  }, []);

  // Filter chips configuration
  const filterChips: FilterChip[] = useMemo(() => [
    {
      id: 'has-email',
      label: 'Has email',
      filter: (row) => columns.some(col =>
        col.toLowerCase().includes('email') && row[col] && row[col].includes('@')
      )
    },
    {
      id: 'missing-data',
      label: 'Missing data',
      filter: (row) => Object.values(row).some(val => !val || val === '')
    },
    {
      id: 'complete',
      label: 'Complete',
      filter: (row) => Object.values(row).every(val => val && val !== '')
    },
    {
      id: 'long-names',
      label: 'Long names',
      filter: (row) => columns.some(col =>
        col.toLowerCase().includes('name') && row[col] && row[col].length > 20
      )
    }
  ], [columns]);

  // Static help row shown above suggestions when the box is empty
  const showSyntaxHint = inputValue === '';

  // Generate search suggestions
  const suggestions = useMemo(() => {
    const suggs: SearchSuggestion[] = [];
    const queryLower = inputValue.toLowerCase();
    const lastWord = getLastToken(inputValue);

    if (inputValue === '') {
      suggs.push({
        type: 'syntax',
        text: 'name:"John Doe"',
        display: 'name:"John Doe"',
        description: 'Search for exact phrases with quotes'
      });
    }

    // Column name suggestions
    if (queryLower.length > 0) {
      columns.forEach(col => {
        if (col.toLowerCase().includes(lastWord.toLowerCase().split(':')[0].replace(/"/g, ''))) {
          suggs.push({
            type: 'column',
            text: `${formatColumnToken(col)}:`,
            display: `${col}:`,
            description: `Search in ${col} column`
          });
        }
      });
    }

    // Value suggestions based on column
    const colonIndex = lastWord.indexOf(':');
    if (colonIndex > -1) {
      const columnName = lastWord.substring(0, colonIndex).replace(/"/g, '');
      const valueStart = lastWord.substring(colonIndex + 1).replace(/"/g, '').toLowerCase();
      const matchingCol = findColumn(columns, columnName);

      const uniqueValues = new Set<string>();
      if (matchingCol) {
        for (const row of tableData) {
          const value = row[matchingCol]?.toString();
          if (value && value.toLowerCase().includes(valueStart)) {
            uniqueValues.add(value);
            if (uniqueValues.size >= 5) break;
          }
        }
      }

      Array.from(uniqueValues).forEach(value => {
        suggs.push({
          type: 'value',
          text: `${formatColumnToken(matchingCol || columnName)}:"${value}"`,
          display: value,
          description: `in ${matchingCol || columnName}`
        });
      });
    }

    // Recent searches
    if (recentSearches.length > 0 && inputValue === '') {
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
  }, [inputValue, columns, tableData, recentSearches]);

  // Filter data based on search and active chips
  const filteredData = useMemo(() => {
    let filtered = tableData;

    if (searchQuery.trim()) {
      const filters = parseSearchQuery(searchQuery, columns);
      filtered = filtered.filter(row => {
        return filters.every(filter => {
          if (filter.column) {
            const matchingCol = findColumn(columns, filter.column);
            return !!matchingCol && !!row[matchingCol] &&
              row[matchingCol].toString().toLowerCase().includes(filter.value);
          }
          return Object.values(row).some(val =>
            val && val.toString().toLowerCase().includes(filter.value)
          );
        });
      });
    }

    filterChips.forEach(chip => {
      if (activeFilterChips.has(chip.id)) {
        filtered = filtered.filter(chip.filter);
      }
    });

    return filtered;
  }, [searchQuery, activeFilterChips, tableData, columns, filterChips]);

  useEffect(() => {
    onFilteredDataChange(filteredData);
  }, [filteredData, onFilteredDataChange]);

  const filteredCount = filteredData.length;
  const hasActiveFilters = searchQuery.trim() !== '' || activeFilterChips.size > 0;

  // Handle search submission
  const handleSearch = (query: string) => {
    applyQuery(query);
    setShowSuggestions(false);

    if (query.trim() && !recentSearches.includes(query)) {
      setRecentSearches(prev => [query, ...prev].slice(0, 5));
    }
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'column') {
      const lastToken = getLastToken(inputValue);
      applyQuery(inputValue.slice(0, inputValue.length - lastToken.length) + suggestion.text);
      setSelectedSuggestionIndex(-1);
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
    applyQuery("");
    setActiveFilterChips(new Set());
    searchInputRef.current?.focus();
  };

  const isListOpen = showSuggestions && suggestions.length > 0;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <div className="mb-4 space-y-3">
      {/* Smart Search Bar */}
      <div className="relative">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </div>
          <input
            ref={searchInputRef}
            type="search"
            role="combobox"
            aria-label="Search entries"
            aria-autocomplete="list"
            aria-expanded={isListOpen}
            aria-controls={isListOpen ? listboxId : undefined}
            aria-activedescendant={
              isListOpen && selectedSuggestionIndex >= 0
                ? optionId(selectedSuggestionIndex)
                : undefined
            }
            value={inputValue}
            onChange={(e) => {
              const value = e.target.value;
              setInputValue(value);
              setShowSuggestions(true);
              setSelectedSuggestionIndex(-1);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                debounceRef.current = null;
                setSearchQuery(value);
              }, SEARCH_DEBOUNCE_MS);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setShowSuggestions(true);
                setSelectedSuggestionIndex(prev =>
                  prev < suggestions.length - 1 ? prev + 1 : prev
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
              } else if (e.key === 'Enter' && isListOpen && selectedSuggestionIndex >= 0) {
                e.preventDefault();
                handleSuggestionClick(suggestions[selectedSuggestionIndex]);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(inputValue);
              } else if (e.key === 'Escape') {
                if (isListOpen) {
                  // Close suggestions without clearing the query
                  e.preventDefault();
                  setShowSuggestions(false);
                }
              }
            }}
            placeholder="Search all columns or use column:value"
            className={`w-full pl-10 pr-24 py-2.5 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              [&::-webkit-search-cancel-button]:appearance-none
              ${TRANSITIONS.fast}`}
            style={{ backgroundColor: COLORS.white }}
          />

          <div className="absolute inset-y-0 right-0 flex items-center pr-3 gap-2">
            {(inputValue || activeFilterChips.size > 0) && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-gray-400 hover:text-gray-600 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Clear search and filters"
                aria-label="Clear search and filters"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <span
              className="text-xs text-gray-500 font-medium tabular-nums"
              aria-label={`${filteredCount} of ${tableData.length} entries shown`}
            >
              {filteredCount}/{tableData.length}
            </span>
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {isListOpen && (
          <div
            className="absolute z-20 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-y-auto"
            style={{ maxHeight: '320px' }}
            // Keep focus in the input so blur doesn't close the list before a click registers
            onMouseDown={(e) => e.preventDefault()}
          >
            {showSyntaxHint && (
              <div className="px-4 py-2.5 flex items-center gap-3 border-b border-gray-100 text-left">
                <HelpCircle className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-medium text-gray-900">Search syntax</div>
                  <div className="text-xs text-gray-500">
                    Use column:value to search specific columns
                  </div>
                </div>
              </div>
            )}
            <ul id={listboxId} role="listbox" aria-label="Search suggestions">
              {suggestions.map((suggestion, index) => (
                <li
                  key={`${suggestion.type}-${suggestion.text}-${index}`}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selectedSuggestionIndex === index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  className={`w-full px-4 py-2.5 text-left cursor-pointer flex items-center justify-between group
                    ${selectedSuggestionIndex === index ? 'bg-gray-100' : 'hover:bg-gray-50'}
                    ${TRANSITIONS.fast}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {suggestion.type === 'column' && (
                      <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <span className="text-xs font-bold text-blue-600">C</span>
                      </div>
                    )}
                    {suggestion.type === 'value' && (
                      <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <span className="text-xs font-bold text-green-600">V</span>
                      </div>
                    )}
                    {suggestion.type === 'syntax' && (
                      <Search className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    )}
                    {suggestion.type === 'recent' && (
                      <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {suggestion.display}
                      </div>
                      {suggestion.description && (
                        <div className="text-xs text-gray-500 truncate">{suggestion.description}</div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quick Filter Chips */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-labelledby={`${listboxId}-chips`}>
        <div className="flex items-center gap-1 text-sm text-gray-600">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span id={`${listboxId}-chips`}>Quick filters:</span>
        </div>
        {filterChips.map(chip => {
          const isActive = activeFilterChips.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => toggleFilterChip(chip.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
                ${isActive
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Active Filter Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" role="status">
          <span className="text-gray-600">Showing:</span>
          <span className="font-medium text-gray-900">
            {filteredCount} of {tableData.length} {tableData.length === 1 ? 'entry' : 'entries'}
          </span>
          {searchQuery.trim() && (
            <span className="text-gray-500 break-all">
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
