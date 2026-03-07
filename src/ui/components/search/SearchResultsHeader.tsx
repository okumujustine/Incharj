/**
 * SearchResultsHeader Component
 * 
 * Displays the search results count summary line.
 * Shows how many documents match the query and whether results are truncated.
 * 
 * @example
 * // When showing all results:
 * "3 documents contain "search term":"
 * 
 * // When truncated:
 * "10 documents contain "search term" (showing 3):"
 */

import React from "react";
import { Box, Text } from "ink";

interface SearchResultsHeaderProps {
  /** Total number of documents that match the search */
  totalResults: number;
  /** Number of results currently being displayed */
  displayedResults: number;
  /** The search query string */
  query: string;
}

/**
 * Returns the correct pluralized form of "document"
 */
function pluralizeDocument(count: number): string {
  return count === 1 ? "document" : "documents";
}

export const SearchResultsHeader: React.FC<SearchResultsHeaderProps> = ({
  totalResults,
  displayedResults,
  query,
}) => {
  const isTruncated = totalResults > displayedResults;

  return (
    <Box marginBottom={1}>
      <Text color="green" bold>
        {totalResults} {pluralizeDocument(totalResults)} contain "{query}"
        {/* Show truncation indicator if not all results are displayed */}
        {isTruncated && (
          <Text dimColor> (showing {displayedResults})</Text>
        )}
        :
      </Text>
    </Box>
  );
};
