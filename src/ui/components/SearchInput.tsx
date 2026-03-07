/**
 * SearchInput Component
 * 
 * Clean, modern text input field for search queries and slash commands.
 * Uses ink-text-input for terminal-compatible text editing.
 * 
 * Features:
 * - Minimal visual design with subtle accent
 * - Placeholder text for guidance
 * - Full width responsive layout
 */

import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "../theme/index.js";

interface SearchInputProps {
  /** Current search query string */
  query: string;
  /** Callback when query changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed while input is focused */
  onSubmit?: (value: string) => void;
  /** Explicit width for the input container */
  width?: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({ query, onChange, onSubmit, width }) => {
  const { colors } = useTheme();

  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor={colors.border}
      paddingX={1}
      width={width}
    >
      <Text color={colors.primary}>◆ </Text>
      <Box flexGrow={1}>
        <TextInput
          value={query}
          onChange={onChange}
          onSubmit={(value) => onSubmit?.(value)}
          placeholder="Type to search · Press / for commands"
        />
      </Box>
    </Box>
  );
};
