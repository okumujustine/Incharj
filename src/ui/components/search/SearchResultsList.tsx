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

import React, { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { SearchResultItem } from "./SearchResultItem.js";
import { SearchResultsHeader } from "./SearchResultsHeader.js";
import { SearchHint, NoResults } from "./SearchEmptyStates.js";
import { useTheme } from "../../theme/index.js";

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
  /** Whether onboarding-style keyboard hints should be visible */
  showHints?: boolean;
  /** Optional container height from parent layout */
  maxHeight?: number;
  /** Render as de-emphasized background (for modal preview state) */
  dimmed?: boolean;
}

/** 
 * Maximum number of results to display at once.
 * Each result takes approximately 2 lines (path + snippet).
 */
/** Minimum query length required to perform a search */
const MIN_QUERY_LENGTH = 2;

/** Container height for consistent layout */
const RESULTS_CONTAINER_HEIGHT = 12;

export const SearchResultsList: React.FC<SearchResultsListProps> = ({ 
  results, 
  query, 
  selectedIndex,
  showHints = true,
  maxHeight = RESULTS_CONTAINER_HEIGHT,
  dimmed = false,
}) => {
  const { colors } = useTheme();

  // Show hint if query is too short
  const queryTooShort = query.trim().length < MIN_QUERY_LENGTH;
  if (queryTooShort) {
    return showHints ? <SearchHint /> : <Box marginTop={1} height={maxHeight} />;
  }

  // Show no results message if search returned empty
  const hasNoResults = results.length === 0;
  if (hasNoResults) {
    return <NoResults query={query} />;
  }

  // Calculate how many rows can fit in current height.
  const maxVisibleResults = useMemo(() => Math.max(
    1,
    Math.floor((maxHeight - 4) / 2)
  ), [maxHeight]);

  // Edge-triggered scrolling: only shift window when selection
  // reaches the top/bottom edge, not while moving in the middle.
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    const maxStart = Math.max(0, results.length - maxVisibleResults);

    setStartIndex((prev) => {
      let next = prev;
      if (selectedIndex < prev) {
        next = selectedIndex;
      } else if (selectedIndex >= prev + maxVisibleResults) {
        next = selectedIndex - maxVisibleResults + 1;
      }
      return Math.max(0, Math.min(next, maxStart));
    });
  }, [selectedIndex, maxVisibleResults, results.length]);

  const endIndex = Math.min(results.length, startIndex + maxVisibleResults);
  const visibleResults = results.slice(startIndex, endIndex);
  
  // Scroll indicators
  const canScrollUp = startIndex > 0;
  const canScrollDown = endIndex < results.length;

  return (
    <Box flexDirection="column" marginTop={1} height={maxHeight} width="100%">
      {/* Results count header */}
      <SearchResultsHeader
        totalResults={results.length}
        displayedResults={visibleResults.length}
        query={query}
        dimmed={dimmed}
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
          dimmed={dimmed}
        />
      ))}

      {/* Scroll down indicator */}
      {canScrollDown && (
        <Text dimColor>  ↓ {results.length - endIndex} more below</Text>
      )}

      {/* Navigation hints */}
      <Box marginTop={1}>
        <Text dimColor>
          <Text color={colors.highlight}>↑↓</Text> navigate  <Text color={colors.highlight}>Enter</Text> preview  <Text color={colors.highlight}>/</Text> commands
        </Text>
      </Box>
    </Box>
  );
};

// Re-export as SearchResults for backward compatibility
export { SearchResultsList as SearchResults };
