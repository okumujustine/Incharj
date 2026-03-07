/**
 * SearchInput Component
 * 
 * Full-width text input field for search queries and slash commands.
 * Uses ink-text-input for terminal-compatible text editing.
 * 
 * Features:
 * - Placeholder text for empty state
 * - Prompt indicator (›) for visual clarity
 * - Full width to use all available space
 */

import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface SearchInputProps {
  /** Current search query string */
  query: string;
  /** Callback when query changes */
  onChange: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ query, onChange }) => (
  <Box
    marginTop={1}
    borderStyle="round"
    borderColor="cyan"
    paddingX={2}
    width="100%"
  >
    <Text color="magenta">› </Text>
    <Box flexGrow={1}>
      <TextInput
        value={query}
        onChange={onChange}
        placeholder="Search or type / for commands"
      />
    </Box>
  </Box>
);
