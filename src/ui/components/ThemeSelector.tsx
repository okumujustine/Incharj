import React from "react";
import { Box, Text } from "ink";
import { Theme, useTheme } from "../theme/index.js";

interface ThemeSelectorProps {
  themes: Theme[];
  selectedIndex: number;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ themes, selectedIndex }) => {
  const { colors, theme: currentTheme } = useTheme();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color={colors.primary}>◆</Text>
        <Text color={colors.text} bold> Select Theme</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={colors.textDim}>{"─".repeat(40)}</Text>
      </Box>

      {themes.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isActive = item.name === currentTheme.name;

        return (
          <Box key={item.name} paddingLeft={1}>
            <Text color={isSelected ? colors.primary : colors.textDim}>
              {isSelected ? "› " : "  "}
            </Text>
            <Text color={isSelected ? colors.primary : colors.text} bold>
              {item.displayName}
            </Text>
            {isActive && (
              <Text color={colors.success}>  (active)</Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={colors.textDim}>{"─".repeat(40)}</Text>
      </Box>
      <Box paddingLeft={1}>
        <Text dimColor>
          <Text color={colors.highlight}>↑↓</Text> choose  <Text color={colors.highlight}>Enter</Text> apply  <Text color={colors.highlight}>Esc</Text> cancel
        </Text>
      </Box>
    </Box>
  );
};
