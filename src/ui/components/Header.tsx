/**
 * Header Component (Legacy)
 * 
 * This component is kept for backward compatibility.
 * New code should use AppHeader from ./header/AppHeader.tsx
 */

import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  folders: string[];
  extensions: string[];
}

export const Header: React.FC<HeaderProps> = ({ folders, extensions }) => (
  <Box flexDirection="column">
    {/* Title box */}
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text color="magenta" bold>■■  </Text>
        <Text bold>Incharj</Text>
        <Text dimColor> v0.1.0</Text>
      </Box>
      <Text color="cyan">Search documents by keywords</Text>
    </Box>
    
    {/* Tip line */}
    <Box marginTop={1}>
      <Text dimColor>Tip: </Text>
      <Text color="cyan">/index</Text>
      <Text dimColor> to scan folders, </Text>
      <Text color="cyan">/quit</Text>
      <Text dimColor> to exit</Text>
    </Box>
    
    {/* Folders info */}
    <Box marginTop={1}>
      <Text color="green">● </Text>
      <Text dimColor>Folders: {folders.join(", ")}</Text>
    </Box>
  </Box>
);
