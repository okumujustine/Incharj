/**
 * QuickTips Component
 * 
 * Minimal hint for common commands.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../theme/index.js";

export const QuickTips: React.FC = () => {
  const { colors } = useTheme();

  return (
    <Box marginTop={1} justifyContent="center">
      <Text color={colors.primary}>/index</Text>
      <Text dimColor> scan </Text>
      <Text color={colors.textDim}>·</Text>
      <Text dimColor> </Text>
      <Text color={colors.primary}>/quit</Text>
      <Text dimColor> exit</Text>
    </Box>
  );
};
