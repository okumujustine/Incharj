/**
 * AppBranding Component
 * 
 * Displays the application name with a stunning ASCII art header.
 * Modern, minimal aesthetic with clean typography.
 * 
 * Supports responsive modes:
 * - full: Complete ASCII art logo (default)
 * - compact: Smaller logo for medium terminals
 * - minimal: Single-line header for small terminals
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

/** Application metadata */
const APP_INFO = {
  NAME: "INCHARJ",
  VERSION: "0.1.0",
  TAGLINE: "Document Search Engine",
} as const;

/** Clean Modern Logo */
const LOGO = [
  "  ▀█▀ █▄ █ █▀▀ █░█ ▄▀█ █▀█ ░░█ ",
  "  ░█░ █░▀█ █▄▄ █▀█ █▀█ █▀▄ █▄█ ",
];

interface AppBrandingProps {
  /** Display mode: 'full' for ASCII art, 'compact' for 3-line, 'minimal' for single-line */
  mode?: "full" | "compact" | "minimal";
  /** Maximum width available */
  maxWidth?: number;
}

export const AppBranding: React.FC<AppBrandingProps> = ({ mode = "full", maxWidth }) => {
  const { colors } = useTheme();
  const logoWidth = LOGO[0].length;
  const useMinimal = mode === "minimal" || (maxWidth !== undefined && maxWidth < 40);
  const useCompact = mode === "compact" || (maxWidth !== undefined && maxWidth < logoWidth + 4);
  
  // Minimal single-line header for very small terminals
  if (useMinimal) {
    return (
      <Box width="100%" justifyContent="center">
        <Text bold color={colors.primary}>◆ {APP_INFO.NAME}</Text>
        <Text color={colors.textDim}> │ </Text>
        <Text dimColor>{APP_INFO.TAGLINE}</Text>
      </Box>
    );
  }
  
  // Compact mode - just the logo, no extras
  if (useCompact) {
    return (
      <Box flexDirection="column" width="100%" alignItems="center">
        <Box flexDirection="column">
          <Text color={colors.primary} bold>{LOGO[0]}</Text>
          <Text color={colors.accent}>{LOGO[1]}</Text>
        </Box>
      </Box>
    );
  }
  
  // Full modern header with clean separators
  return (
    <Box flexDirection="column" width="100%" alignItems="center">
      {/* Top decorative line */}
      <Box>
        <Text color={colors.textDim}>{"─".repeat(logoWidth)}</Text>
      </Box>
      
      {/* Logo with gradient */}
      <Box flexDirection="column" marginY={1}>
        <Text color={colors.primary} bold>{LOGO[0]}</Text>
        <Text color={colors.accent}>{LOGO[1]}</Text>
      </Box>
      
      {/* Bottom decorative line */}
      <Box>
        <Text color={colors.textDim}>{"─".repeat(logoWidth)}</Text>
      </Box>
      
      {/* Tagline with version badge */}
      <Box marginTop={1}>
        <Text color={colors.text} dimColor>{APP_INFO.TAGLINE}</Text>
        <Text color={colors.textDim}> · </Text>
        <Text color={colors.accent}>v{APP_INFO.VERSION}</Text>
      </Box>
    </Box>
  );
};
