/**
 * SearchResultItem Component
 * 
 * Renders a single search result with file path, occurrence count, and snippet.
 * Supports visual selection highlighting for keyboard navigation.
 * 
 * Layout:
 * › ~/Documents/notes.md (3)
 *     └─ ...highlighted snippet text...
 * 
 * @example
 * <SearchResultItem
 *   path="/Users/me/Documents/notes.md"
 *   snippet="...the <<MATCH>>keyword<<END>> appears here..."
 *   occurrences={3}
 *   isSelected={true}
 * />
 */

import React from "react";
import { Box, Text, useStdout } from "ink";
import os from "node:os";
import { TextHighlighter } from "../common/TextHighlighter.js";

interface SearchResultItemProps {
  /** Full path to the file */
  path: string;
  /** Text snippet containing the match with highlight markers */
  snippet?: string;
  /** Number of times the search term appears in this document */
  occurrences?: number;
  /** Whether this item is currently selected (keyboard navigation) */
  isSelected: boolean;
}

/**
 * Formats a file path for display by replacing home directory with ~
 */
function formatPathForDisplay(fullPath: string): string {
  return fullPath.replace(os.homedir(), "~");
}

/**
 * Cleans and truncates snippet text for display
 * - Normalizes whitespace (multiple spaces/newlines become single space)
 * - Truncates to maximum visible length (excludes marker characters)
 */
function formatSnippet(snippet: string, maxVisibleLength: number): string {
  const cleaned = snippet.replace(/\s+/g, " ");
  
  // Remove markers to count visible characters
  const visibleText = cleaned.replace(/<<MATCH>>|<<END>>/g, "");
  if (visibleText.length <= maxVisibleLength) {
    return cleaned;
  }
  
  // Truncate while preserving markers
  let visibleCount = 0;
  let result = "";
  let i = 0;
  
  while (i < cleaned.length && visibleCount < maxVisibleLength) {
    if (cleaned.startsWith("<<MATCH>>", i)) {
      result += "<<MATCH>>";
      i += 9;
    } else if (cleaned.startsWith("<<END>>", i)) {
      result += "<<END>>";
      i += 7;
    } else {
      result += cleaned[i];
      visibleCount++;
      i++;
    }
  }
  
  return result + "...";
}

export const SearchResultItem: React.FC<SearchResultItemProps> = ({
  path,
  snippet,
  occurrences = 1,
  isSelected,
}) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout.columns ?? 120;
  const maxSnippetLength = Math.max(80, terminalWidth - 24);
  const displayPath = formatPathForDisplay(path);
  const formattedSnippet = snippet ? formatSnippet(snippet, maxSnippetLength) : "";

  return (
    <Box flexDirection="column" marginBottom={0} width="100%">
      {/* File path row with selection indicator */}
      <Box width="100%" justifyContent="space-between">
        <Box flexGrow={1}>
          <Text
            backgroundColor={isSelected ? "cyan" : undefined}
            color={isSelected ? "black" : "white"}
            wrap="truncate"
          >
            {isSelected ? "› " : "  "}
            {displayPath}
          </Text>
        </Box>
        <Text color="yellow"> ({occurrences})</Text>
      </Box>

      {/* Snippet row with tree-style connector */}
      {formattedSnippet && (
        <Box paddingLeft={4} width="100%">
          <Text dimColor>└─ </Text>
          <TextHighlighter text={formattedSnippet} />
        </Box>
      )}
    </Box>
  );
};
