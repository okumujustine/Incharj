/**
 * StatusMessage Component
 * 
 * Displays temporary status messages to the user (success, error, info).
 * Used to provide feedback after operations like file opening or index reset.
 * 
 * @example
 * <StatusMessage message="File opened successfully" />
 */

import React from "react";
import { Box, Text } from "ink";

interface StatusMessageProps {
  /** The message to display (null/undefined hides the component) */
  message: string | null | undefined;
  /** Color of the message text (default: "yellow") */
  color?: string;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ 
  message, 
  color = "yellow" 
}) => {
  // Don't render anything if there's no message
  if (!message) {
    return null;
  }

  return (
    <Box marginTop={1}>
      <Text color={color}>{message}</Text>
    </Box>
  );
};
