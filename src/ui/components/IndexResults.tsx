import React from "react";
import { Box, Text } from "ink";
import os from "node:os";

interface IndexResultsProps {
  indexedFiles: string[];
  skipped: number;
}

export const IndexResults: React.FC<IndexResultsProps> = ({
  indexedFiles,
  skipped,
}) => {
  const maxDisplay = 10;

  if (indexedFiles.length === 0) {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">No new files indexed (skipped {skipped})</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green" bold>
        Indexed {indexedFiles.length} file{indexedFiles.length > 1 ? "s" : ""}:
      </Text>
      {indexedFiles.slice(0, maxDisplay).map((file, i) => (
        <Box key={file} paddingLeft={1}>
          <Text color="cyan">{i + 1}.</Text>
          <Text> {file.replace(os.homedir(), "~")}</Text>
        </Box>
      ))}
      {indexedFiles.length > maxDisplay && (
        <Box paddingLeft={1}>
          <Text dimColor>...and {indexedFiles.length - maxDisplay} more</Text>
        </Box>
      )}
      {skipped > 0 && (
        <Box marginTop={1}>
          <Text dimColor>({skipped} files unchanged)</Text>
        </Box>
      )}
    </Box>
  );
};
