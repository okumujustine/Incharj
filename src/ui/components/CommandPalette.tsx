import React from "react";
import { Box, Text } from "ink";
import { Command } from "../../commands/index.js";

interface CommandPaletteProps {
  commands: Command[];
  selectedIndex: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  selectedIndex,
}) => {
  if (commands.length === 0) {
    return (
      <Box marginTop={1} paddingX={2}>
        <Text color="yellow">No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Commands:
        </Text>
      </Box>
      {commands.map((cmd, index) => (
        <Box key={cmd.name} paddingX={2}>
          <Text
            backgroundColor={index === selectedIndex ? "cyan" : undefined}
            color={index === selectedIndex ? "black" : "white"}
          >
            <Text bold>/{cmd.name}</Text>
            <Text dimColor> ({cmd.shortcut})</Text>
            <Text> - {cmd.description}</Text>
          </Text>
        </Box>
      ))}
      <Box marginTop={1} paddingX={2}>
        <Text dimColor>Use arrow keys to navigate, Enter to select</Text>
      </Box>
    </Box>
  );
};
