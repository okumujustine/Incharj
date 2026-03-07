/**
 * ProgressBar Component
 * 
 * Modern, minimal progress indicator with clean aesthetics.
 * Used during long-running operations like file indexing.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

interface ProgressBarProps {
  /** Progress value between 0 and 1 (e.g., 0.5 = 50%) */
  progress: number;
  /** Total width of the bar in characters (default: 30) */
  width?: number;
  /** Optional label for the progress */
  label?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  width = 30,
  label
}) => {
  const { colors } = useTheme();

  // Clamp progress between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  // Calculate filled vs empty
  const filledCount = Math.round(clampedProgress * width);
  const emptyCount = width - filledCount;
  
  // Calculate percentage
  const percentage = Math.round(clampedProgress * 100);

  return (
    <Box>
      {label && <Text dimColor>{label} </Text>}
      <Text color={colors.textDim}>[</Text>
      <Text color={colors.primary}>{"━".repeat(filledCount)}</Text>
      <Text color={colors.textDim}>{" ".repeat(emptyCount)}</Text>
      <Text color={colors.textDim}>]</Text>
      <Text color={percentage === 100 ? colors.success : colors.text}> {percentage}%</Text>
    </Box>
  );
};
