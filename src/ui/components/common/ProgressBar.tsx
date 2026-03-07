/**
 * ProgressBar Component
 * 
 * Displays a visual progress indicator with filled/empty blocks and percentage.
 * Used during long-running operations like file indexing to show completion status.
 * 
 * @example
 * <ProgressBar progress={0.5} width={30} />
 * // Renders: ███████████████░░░░░░░░░░░░░░░ 50%
 */

import React from "react";
import { Text } from "ink";

/** Configuration for the progress bar appearance */
const PROGRESS_CONFIG = {
  /** Character used to show completed portion */
  FILLED_CHAR: "█",
  /** Character used to show remaining portion */
  EMPTY_CHAR: "░",
  /** Default width in characters if not specified */
  DEFAULT_WIDTH: 30,
} as const;

interface ProgressBarProps {
  /** Progress value between 0 and 1 (e.g., 0.5 = 50%) */
  progress: number;
  /** Total width of the bar in characters (default: 30) */
  width?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  width = PROGRESS_CONFIG.DEFAULT_WIDTH 
}) => {
  // Clamp progress between 0 and 1 to prevent overflow
  const clampedProgress = Math.max(0, Math.min(1, progress));
  
  // Calculate the number of filled vs empty characters
  const filledCount = Math.round(clampedProgress * width);
  const emptyCount = width - filledCount;
  
  // Calculate percentage for display
  const percentageDisplay = Math.round(clampedProgress * 100);

  return (
    <Text>
      <Text color="cyan">
        {PROGRESS_CONFIG.FILLED_CHAR.repeat(filledCount)}
      </Text>
      <Text dimColor>
        {PROGRESS_CONFIG.EMPTY_CHAR.repeat(emptyCount)}
      </Text>
      <Text> {percentageDisplay}%</Text>
    </Text>
  );
};
