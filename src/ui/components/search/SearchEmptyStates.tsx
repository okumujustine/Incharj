/**
 * SearchEmptyStates Component
 * 
 * Clean, helpful empty state messages for various scenarios.
 * Modern aesthetic with subtle guidance.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

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
  <SearchHintContent />
);

const SearchHintContent: React.FC = () => {
  const { colors } = useTheme();

  return (
    <EmptyStateContainer>
      <Box
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        flexDirection="column"
        alignItems="center"
      >
        <Text dimColor>Shortcuts</Text>
        <Box>
          <Text color={colors.highlight}>↑↓</Text>
          <Text dimColor> move </Text>
          <Text color={colors.textDim}>•</Text>
          <Text dimColor> </Text>
          <Text color={colors.highlight}>↵</Text>
          <Text dimColor> open </Text>
          <Text color={colors.textDim}>•</Text>
          <Text dimColor> </Text>
          <Text color={colors.highlight}>/</Text>
          <Text dimColor> commands</Text>
        </Box>
      </Box>
    </EmptyStateContainer>
  );
};

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
  <NoResultsContent query={query} />
);

const NoResultsContent: React.FC<NoResultsProps> = ({ query }) => {
  const { colors } = useTheme();

  return (
    <EmptyStateContainer>
      <Box marginBottom={1}>
        <Text color={colors.textDim}>─────────────────────</Text>
      </Box>
      <Box>
        <Text color={colors.textDim}>○ </Text>
        <Text dimColor>No matches for </Text>
        <Text color={colors.highlight}>"{query}"</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text dimColor>Try different terms or </Text>
        <Box>
          <Text color={colors.primary}>/index</Text>
          <Text dimColor> more files</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={colors.textDim}>─────────────────────</Text>
      </Box>
    </EmptyStateContainer>
  );
};
