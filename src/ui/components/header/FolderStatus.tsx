/**
 * FolderStatus Component
 * 
 * Displays which folders are being indexed/searched.
 * Uses a green dot indicator to show "active" status.
 * 
 * Visual layout:
 * ● Folders: ~/Documents, ~/Projects
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

interface FolderStatusProps {
  /** List of folder paths being searched (can use ~ for home) */
  folders: string[];
}

export const FolderStatus: React.FC<FolderStatusProps> = ({ folders }) => {
  const { colors } = useTheme();

  return (
    <Box marginTop={1}>
      <Text color={colors.success}>● </Text>
      <Text dimColor>Folders: {folders.join(", ")}</Text>
    </Box>
  );
};
