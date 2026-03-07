/**
 * StatusMessage Component
 * 
 * Displays temporary status messages with subtle, modern styling.
 * Used to provide feedback after operations like file opening or index reset.
 */

import React from "react";
import { Box, Text } from "ink";

interface StatusMessageProps {
  /** The message to display (null/undefined hides the component) */
  message: string | null | undefined;
  /** Color of the message text (default: "yellow") */
  color?: string;
  /** Type of message for icon selection */
  type?: "info" | "success" | "error" | "warning";
}

const ICONS = {
  info: "○",
  success: "✓",
  error: "✕",
  warning: "!",
} as const;

export const StatusMessage: React.FC<StatusMessageProps> = ({ 
  message, 
  color = "gray",
  type = "info"
}) => {
  if (!message) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color={color}>{ICONS[type]} </Text>
      <Text dimColor>{message}</Text>
    </Box>
  );
};
