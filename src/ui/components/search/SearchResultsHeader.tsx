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
import { useTheme } from "../../theme/index.js";

interface SearchResultsHeaderProps {
  /** Total number of documents that match the search */
  totalResults: number;
  /** Number of results currently being displayed */
  displayedResults: number;
  /** The search query string */
  query: string;
  /** Whether header is shown as background behind modal */
  dimmed?: boolean;
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
  dimmed = false,
}) => {
  const { colors } = useTheme();
  const isTruncated = totalResults > displayedResults;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={dimmed ? colors.textDim : colors.primary}>◆</Text>
        <Text color={dimmed ? colors.textDim : colors.text} bold={!dimmed}> {totalResults} {pluralizeDocument(totalResults)} </Text>
        <Text dimColor>matching </Text>
        <Text color={dimmed ? colors.textDim : colors.highlight}>"{query}"</Text>
        {isTruncated && (
          <Text color={colors.textDim}> · showing {displayedResults}</Text>
        )}
      </Box>
      <Box>
        <Text color={colors.textDim}>{"─".repeat(50)}</Text>
      </Box>
    </Box>
  );
};
