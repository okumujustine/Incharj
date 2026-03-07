/**
 * SearchResultsList Component
 * 
 * Main container for displaying search results with keyboard navigation.
 * Orchestrates the display of search results including:
 * - Empty state when query is too short
 * - No results message when no matches found
 * - List of matching documents with highlighting
 * 
 * This is the primary search results component used in the App.
 */

import React from "react";
import { Box, Text } from "ink";
import { SearchResultItem } from "./SearchResultItem.js";
import { SearchResultsHeader } from "./SearchResultsHeader.js";
import { SearchHint, NoResults } from "./SearchEmptyStates.js";

/** Search result data structure from the search query module */
interface SearchResult {
  /** Full path to the matching file */
  path: string;
  /** Text snippet containing matched terms with highlight markers */
  snippet?: string;
  /** Number of times the search term appears in this document */
  occurrences?: number;
}

interface SearchResultsListProps {
  /** Array of search results to display */
  results: SearchResult[];
  /** The current search query string */
  query: string;
  /** Index of the currently selected result (for keyboard navigation) */
  selectedIndex: number;
}

/** 
 * Maximum number of results to display at once.
 * Each result takes approximately 2 lines (path + snippet).
 */
const MAX_VISIBLE_RESULTS = 5;

/** Minimum query length required to perform a search */
const MIN_QUERY_LENGTH = 2;

/** Container height for consistent layout */
const RESULTS_CONTAINER_HEIGHT = 12;

export const SearchResultsList: React.FC<SearchResultsListProps> = ({ 
  results, 
  query, 
  selectedIndex 
}) => {
  // Show hint if query is too short
  const queryTooShort = query.trim().length < MIN_QUERY_LENGTH;
  if (queryTooShort) {
    return <SearchHint />;
  }

  // Show no results message if search returned empty
  const hasNoResults = results.length === 0;
  if (hasNoResults) {
    return <NoResults query={query} />;
  }

  // Calculate scroll window - keeps selected item visible
  const scrollOffset = Math.max(0, Math.min(
    selectedIndex - Math.floor(MAX_VISIBLE_RESULTS / 2),
    results.length - MAX_VISIBLE_RESULTS
  ));
  const startIndex = Math.max(0, scrollOffset);
  const endIndex = Math.min(results.length, startIndex + MAX_VISIBLE_RESULTS);
  const visibleResults = results.slice(startIndex, endIndex);
  
  // Scroll indicators
  const canScrollUp = startIndex > 0;
  const canScrollDown = endIndex < results.length;

  return (
    <Box flexDirection="column" marginTop={1} height={RESULTS_CONTAINER_HEIGHT} width="100%">
      {/* Results count header */}
      <SearchResultsHeader
        totalResults={results.length}
        displayedResults={visibleResults.length}
        query={query}
      />

      {/* Scroll up indicator */}
      {canScrollUp && (
        <Text dimColor>  ↑ {startIndex} more above</Text>
      )}

      {/* Individual result items */}
      {visibleResults.map((result, index) => (
        <SearchResultItem
          key={result.path}
          path={result.path}
          snippet={result.snippet}
          occurrences={result.occurrences}
          isSelected={startIndex + index === selectedIndex}
        />
      ))}

      {/* Scroll down indicator */}
      {canScrollDown && (
        <Text dimColor>  ↓ {results.length - endIndex} more below</Text>
      )}

      {/* Navigation hints */}
      <Box marginTop={1}>
        <Text dimColor>
          <Text color="yellow">↑↓</Text> navigate  <Text color="yellow">Enter</Text> open  <Text color="yellow">/</Text> commands
        </Text>
      </Box>
    </Box>
  );
};

// Re-export as SearchResults for backward compatibility
export { SearchResultsList as SearchResults };
