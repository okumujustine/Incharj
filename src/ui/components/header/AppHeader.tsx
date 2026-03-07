/**
 * AppHeader Component
 * 
 * Main header section of the application, composed of:
 * - AppBranding: Logo, name, version, tagline
 * - QuickTips: Helpful command hints
 * - FolderStatus: Shows which folders are being searched
 * 
 * This is the primary header component used in the App.
 */

import React from "react";
import { Box } from "ink";
import { AppBranding } from "./AppBranding.js";
import { QuickTips } from "./QuickTips.js";
import { FolderStatus } from "./FolderStatus.js";

interface AppHeaderProps {
  /** List of folder paths being searched */
  folders: string[];
  /** List of file extensions being indexed (currently unused but kept for future) */
  extensions: string[];
}

export const AppHeader: React.FC<AppHeaderProps> = ({ folders, extensions }) => (
  <Box flexDirection="column" width="100%" alignItems="center" marginBottom={1}>
    <AppBranding />
    <QuickTips />
    <FolderStatus folders={folders} />
  </Box>
);

// Re-export as Header for backward compatibility
export { AppHeader as Header };
