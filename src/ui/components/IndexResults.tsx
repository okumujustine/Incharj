import React from "react";
import { Box, Text } from "ink";
import os from "node:os";
import { useTheme } from "../theme/index.js";

interface IndexResultsProps {
  indexedFiles: string[];
  skipped: number;
}

export const IndexResults: React.FC<IndexResultsProps> = ({
  indexedFiles,
  skipped,
}) => {
  const { colors } = useTheme();
  const maxDisplay = 10;

  if (indexedFiles.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color={colors.textDim}>○ </Text>
          <Text dimColor>No new files </Text>
          <Text color={colors.textDim}>·</Text>
          <Text dimColor> {skipped} unchanged</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Text color={colors.success}>✓</Text>
        <Text color={colors.text} bold> {indexedFiles.length}</Text>
        <Text dimColor> file{indexedFiles.length > 1 ? "s" : ""} indexed</Text>
        {skipped > 0 && (
          <>
            <Text color={colors.textDim}> · </Text>
            <Text dimColor>{skipped} unchanged</Text>
          </>
        )}
      </Box>
      
      {/* Separator */}
      <Box marginY={1}>
        <Text color={colors.textDim}>{"─".repeat(40)}</Text>
      </Box>
      
      {/* File list */}
      {indexedFiles.slice(0, maxDisplay).map((file) => (
        <Box key={file} paddingLeft={1}>
          <Text color={colors.primary}>› </Text>
          <Text color={colors.textDim}>{file.replace(os.homedir(), "~")}</Text>
        </Box>
      ))}
      
      {indexedFiles.length > maxDisplay && (
        <Box paddingLeft={1} marginTop={1}>
          <Text dimColor>+ {indexedFiles.length - maxDisplay} more</Text>
        </Box>
      )}
    </Box>
  );
};
