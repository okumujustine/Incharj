/**
 * StatsFooter Component
 * 
 * Displays search statistics at the bottom of the application.
 * Shows:
 * - Total indexed documents count
 * - Search time in seconds
 * - Current theme name
 * 
 * Example: "Searched 2,341 documents in 0.02s • Theme: Cyan"
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

interface StatsFooterProps {
  /** Total number of indexed documents */
  totalDocuments: number;
  /** Search time in milliseconds (null if no search performed) */
  searchTimeMs: number | null;
  /** Whether to show theme switcher hint */
  showThemeHint?: boolean;
}

/**
 * Formats a number with thousand separators.
 * Example: 2341 -> "2,341"
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Formats milliseconds as seconds with appropriate precision.
 * Example: 23 -> "0.02s", 1234 -> "1.23s"
 */
function formatTime(ms: number): string {
  if (ms < 10) return `${(ms / 1000).toFixed(3)}s`;
  if (ms < 100) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const StatsFooter: React.FC<StatsFooterProps> = ({
  totalDocuments,
  searchTimeMs,
  showThemeHint = true,
}) => {
  const { theme, colors } = useTheme();

  return (
    <Box marginTop={1} justifyContent="space-between" width="100%">
      {/* Left side: search stats */}
      <Box>
        <Text dimColor>
          {totalDocuments > 0 ? (
            <>
              <Text color={colors.textDim}>{formatNumber(totalDocuments)} documents indexed</Text>
              {searchTimeMs !== null && (
                <Text color={colors.textDim}> • searched in {formatTime(searchTimeMs)}</Text>
              )}
            </>
          ) : (
            <Text color={colors.warning}>No documents indexed. Run /index to scan folders.</Text>
          )}
        </Text>
      </Box>

      {/* Right side: theme info */}
      {showThemeHint && (
        <Box>
          <Text dimColor>
            <Text color={colors.textDim}>Theme: </Text>
            <Text color={colors.primary}>{theme.displayName}</Text>
            <Text color={colors.textDim}> • </Text>
            <Text color={colors.accent}>/theme</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
};
