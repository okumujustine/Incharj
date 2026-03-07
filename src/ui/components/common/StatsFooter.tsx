/**
 * StatsFooter Component
 * 
 * Clean, minimal footer displaying search statistics.
 * Shows indexed documents, search time, and theme info.
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
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Formats milliseconds as seconds with appropriate precision.
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
    <Box flexDirection="column" marginTop={1} width="100%">
      {/* Separator line */}
      <Box>
        <Text color={colors.textDim}>{"─".repeat(60)}</Text>
      </Box>
      
      {/* Stats row */}
      <Box justifyContent="space-between" width="100%">
        <Box>
          {totalDocuments > 0 ? (
            <>
              <Text color={colors.textDim}>{formatNumber(totalDocuments)}</Text>
              <Text dimColor> indexed</Text>
              {searchTimeMs !== null && (
                <>
                  <Text color={colors.textDim}> · </Text>
                  <Text color={colors.primary}>{formatTime(searchTimeMs)}</Text>
                </>
              )}
            </>
          ) : (
            <>
              <Text color={colors.warning}>○</Text>
              <Text dimColor> No documents · use </Text>
              <Text color={colors.primary}>/index</Text>
            </>
          )}
        </Box>

        {showThemeHint && (
          <Box>
            <Text dimColor>theme: </Text>
            <Text color={colors.primary}>{theme.displayName}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
