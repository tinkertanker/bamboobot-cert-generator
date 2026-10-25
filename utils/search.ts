import type { TableData } from '@/types/certificate';

export interface SearchSuggestion {
  type: 'column' | 'value' | 'syntax' | 'recent';
  text: string;
  display: string;
  description?: string;
}

// Column names ignore case, spaces, underscores, hyphens and dots.
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

// Columns may be quoted ("first name":john) or match a known column (First Name:john).
export const parseSearchQuery = (query: string, columns: string[] = []) => {
  let prepared = query;
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
      filters.push({
        column: column.toLowerCase(),
        value: (match[3] ?? match[4] ?? '').toLowerCase()
      });
    } else {
      filters.push({
        value: (match[5] ?? match[6] ?? '').replace(/"/g, '').toLowerCase()
      });
    }
  }

  return filters;
};

export function getSearchSuggestions(
  inputValue: string,
  columns: string[],
  tableData: TableData[],
  recentSearches: string[]
): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const queryLower = inputValue.toLowerCase();
  const lastWord = getLastToken(inputValue);

  if (inputValue === '') {
    suggestions.push({
      type: 'syntax',
      text: 'name:"John Doe"',
      display: 'name:"John Doe"',
      description: 'Search for exact phrases with quotes'
    });
  }

  if (queryLower.length > 0) {
    columns.forEach(col => {
      if (col.toLowerCase().includes(lastWord.toLowerCase().split(':')[0].replace(/"/g, ''))) {
        suggestions.push({
          type: 'column',
          text: `${formatColumnToken(col)}:`,
          display: `${col}:`,
          description: `Search in ${col} column`
        });
      }
    });
  }

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
      suggestions.push({
        type: 'value',
        text: `${formatColumnToken(matchingCol || columnName)}:"${value}"`,
        display: value,
        description: `in ${matchingCol || columnName}`
      });
    });
  }

  if (recentSearches.length > 0 && inputValue === '') {
    recentSearches.slice(0, 3).forEach(search => {
      suggestions.push({
        type: 'recent',
        text: search,
        display: search,
        description: 'Recent search'
      });
    });
  }

  return suggestions.slice(0, 8);
}
