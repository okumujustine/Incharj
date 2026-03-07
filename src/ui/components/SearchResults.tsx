import React from "react";
import { Box, Text } from "ink";
import os from "node:os";

// Helper to render snippet with highlighted matches
const HighlightedSnippet: React.FC<{ snippet: string }> = ({ snippet }) => {
  const parts = snippet.split(/(<<MATCH>>|<<END>>)/);
  const elements: React.ReactNode[] = [];
  let inMatch = false;
  
  parts.forEach((part, i) => {
    if (part === "<<MATCH>>") {
      inMatch = true;
    } else if (part === "<<END>>") {
      inMatch = false;
    } else if (part) {
      elements.push(
        <Text key={i} color={inMatch ? "cyan" : undefined} bold={inMatch}>
          {part}
        </Text>
      );
    }
  });
  
  return <Text dimColor>{elements}</Text>;
};

interface SearchResult {
  path: string;
  snippet?: string;
  occurrences?: number;
}

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  selectedIndex: number;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ results, query, selectedIndex }) => {
  const maxResults = 2; // Each result takes 2 lines (path + snippet)

  if (query.trim().length < 2) {
    return (
      <Box marginTop={1} height={8} flexDirection="column" alignItems="center">
        <Text dimColor>Start typing to search, use ↑↓ to navigate, Enter to open</Text>
      </Box>
    );
  }

  if (results.length === 0) {
    return (
      <Box marginTop={1} height={8} flexDirection="column" alignItems="center">
        <Text color="yellow">No documents found for "{query}"</Text>
        <Text dimColor>Try a different search term</Text>
      </Box>
    );
  }

  const displayCount = Math.min(results.length, maxResults);
  const hasMore = results.length > maxResults;
  
  return (
    <Box flexDirection="column" marginTop={1} height={8}>
      <Box marginBottom={1}>
        <Text color="green" bold>
          {results.length} document{results.length > 1 ? "s" : ""} contain "{query}"
          {hasMore ? <Text dimColor> (showing {displayCount})</Text> : ""}:
        </Text>
      </Box>
      {results.slice(0, maxResults).map((r, i) => {
        const isSelected = i === selectedIndex;
        const count = r.occurrences || 1;
        const shortPath = r.path.replace(os.homedir(), "~");
        const cleanSnippet = r.snippet ? r.snippet.replace(/\s+/g, " ").slice(0, 100) : "";
        return (
          <Box key={r.path} flexDirection="column" marginBottom={0}>
            <Box>
              <Text
                backgroundColor={isSelected ? "cyan" : undefined}
                color={isSelected ? "black" : "white"}
              >
                {isSelected ? "› " : "  "}{shortPath}
              </Text>
              <Text color="yellow"> ({count})</Text>
            </Box>
            {cleanSnippet && (
              <Box paddingLeft={4}>
                <Text dimColor>└─ </Text>
                <HighlightedSnippet snippet={cleanSnippet} />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
