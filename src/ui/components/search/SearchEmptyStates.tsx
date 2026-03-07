/**
 * SearchEmptyStates Component
 * 
 * Renders appropriate empty state messages when:
 * 1. User hasn't typed enough to search (initial/typing state)
 * 2. No results were found for the query
 * 
 * These provide helpful guidance to the user about what to do next.
 */

import React from "react";
import { Box, Text } from "ink";

/** Container height to maintain consistent layout */
const CONTAINER_HEIGHT = 8;

interface EmptyStateContainerProps {
  children: React.ReactNode;
}

/**
 * Wrapper that provides consistent styling for empty state messages
 */
const EmptyStateContainer: React.FC<EmptyStateContainerProps> = ({ children }) => (
  <Box 
    marginTop={1} 
    height={CONTAINER_HEIGHT} 
    flexDirection="column" 
    alignItems="center"
  >
    {children}
  </Box>
);

/**
 * SearchHint Component
 * 
 * Shown when the search query is too short (less than 2 characters).
 * Provides keyboard navigation hints to the user.
 */
export const SearchHint: React.FC = () => (
  <EmptyStateContainer>
    <Text bold color="cyan">Quick Start</Text>
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>• Type to search your documents</Text>
      <Text dimColor>• Use <Text color="yellow">↑↓</Text> to navigate results</Text>
      <Text dimColor>• Press <Text color="yellow">Enter</Text> to open file</Text>
      <Text dimColor>• Type <Text color="yellow">/</Text> for commands</Text>
    </Box>
  </EmptyStateContainer>
);

interface NoResultsProps {
  /** The search query that yielded no results */
  query: string;
}

/**
 * NoResults Component
 * 
 * Shown when a search query returns zero matching documents.
 * Suggests the user try different search terms.
 */
export const NoResults: React.FC<NoResultsProps> = ({ query }) => (
  <EmptyStateContainer>
    <Text color="yellow">No documents found for "{query}"</Text>
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>• Try a different search term</Text>
      <Text dimColor>• Run <Text color="cyan">/index</Text> to index more files</Text>
      <Text dimColor>• Check indexed folders in config</Text>
    </Box>
  </EmptyStateContainer>
);
