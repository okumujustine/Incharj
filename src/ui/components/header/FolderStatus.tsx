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

interface FolderStatusProps {
  /** List of folder paths being searched (can use ~ for home) */
  folders: string[];
}

export const FolderStatus: React.FC<FolderStatusProps> = ({ folders }) => (
  <Box marginTop={1}>
    {/* Green dot indicates active/configured status */}
    <Text color="green">● </Text>
    <Text dimColor>Folders: {folders.join(", ")}</Text>
  </Box>
);
