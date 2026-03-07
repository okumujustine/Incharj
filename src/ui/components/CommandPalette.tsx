import React from "react";
import { Box, Text } from "ink";
import { Command } from "../../commands/index.js";
import { useTheme } from "../theme/index.js";

interface CommandPaletteProps {
  commands: Command[];
  selectedIndex: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  commands,
  selectedIndex,
}) => {
  const { colors } = useTheme();

  if (commands.length === 0) {
    return (
      <Box marginTop={1} paddingX={2}>
        <Text color={colors.textDim}>○</Text>
        <Text dimColor> No matching commands</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.primary}>◆</Text>
        <Text color={colors.text} bold> Commands</Text>
      </Box>
      
      {/* Separator */}
      <Box marginBottom={1}>
        <Text color={colors.textDim}>{"─".repeat(40)}</Text>
      </Box>
      
      {/* Command list */}
      {commands.map((cmd, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={cmd.name} paddingLeft={1}>
            <Text color={isSelected ? colors.primary : colors.textDim}>
              {isSelected ? "› " : "  "}
            </Text>
            <Text color={isSelected ? colors.primary : colors.text} bold>/{cmd.name}</Text>
            <Text color={colors.textDim}> ({cmd.shortcut})</Text>
            <Text color={isSelected ? colors.text : colors.textDim} dimColor={!isSelected}> — {cmd.description}</Text>
          </Box>
        );
      })}
      
      {/* Footer hint */}
      <Box marginTop={1}>
        <Text color={colors.textDim}>{"─".repeat(40)}</Text>
      </Box>
      <Box paddingLeft={1}>
        {commands.length > 1 ? (
          <Text dimColor>↑↓ navigate · ↵ select</Text>
        ) : (
          <Text dimColor>↵ select</Text>
        )}
      </Box>
    </Box>
  );
};
