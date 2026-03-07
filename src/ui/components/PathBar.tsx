import React from "react";
import { Box, Text } from "ink";
import os from "node:os";

const VERSION = "0.1.0";

export const PathBar: React.FC = () => {
  const cwd = process.cwd().replace(os.homedir(), "~");
  return (
    <Box marginTop={1} justifyContent="space-between" width="100%">
      <Text dimColor>📍 {cwd}</Text>
      <Text dimColor>v{VERSION}</Text>
    </Box>
  );
};
