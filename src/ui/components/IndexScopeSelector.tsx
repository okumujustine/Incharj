import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";

interface IndexScopeSelectorProps {
  broadRoots: string[];
  suggestedFolders: string[];
  selectedFolders: Set<string>;
  selectedIndex: number;
}

export const IndexScopeSelector: React.FC<IndexScopeSelectorProps> = ({
  broadRoots,
  suggestedFolders,
  selectedFolders,
  selectedIndex,
}) => {
  const { colors } = useTheme();

  const continueIndex = 0;
  const firstFolderIndex = 1;
  const startSelectedIndex = firstFolderIndex + suggestedFolders.length;
  const cancelIndex = startSelectedIndex + 1;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color={colors.warning}>⚠</Text>
        <Text color={colors.text} bold> Broad indexing target detected</Text>
      </Box>

      <Text color={colors.textDim}>
        Root{broadRoots.length > 1 ? "s" : ""}: {broadRoots.join(", ")}
      </Text>
      <Text color={colors.textDim}>Indexing an entire disk can be slow/noisy.</Text>

      <Box marginTop={1}>
        <Text color={selectedIndex === continueIndex ? colors.primary : colors.textDim}>
          {selectedIndex === continueIndex ? "› " : "  "}
        </Text>
        <Text color={selectedIndex === continueIndex ? colors.primary : colors.text}>
          Continue full-disk indexing
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={colors.text} bold>Recommended folders:</Text>
      </Box>
      {suggestedFolders.map((folder, i) => {
        const idx = firstFolderIndex + i;
        const selected = selectedFolders.has(folder);
        const focused = selectedIndex === idx;
        return (
          <Box key={folder}>
            <Text color={focused ? colors.primary : colors.textDim}>
              {focused ? "› " : "  "}
            </Text>
            <Text color={selected ? colors.success : colors.textDim}>
              [{selected ? "x" : " "}]
            </Text>
            <Text> </Text>
            <Text color={focused ? colors.text : colors.textDim}>{folder}</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color={selectedIndex === startSelectedIndex ? colors.primary : colors.textDim}>
          {selectedIndex === startSelectedIndex ? "› " : "  "}
        </Text>
        <Text color={selectedIndex === startSelectedIndex ? colors.primary : colors.text}>
          Start with selected folders
        </Text>
      </Box>

      <Box>
        <Text color={selectedIndex === cancelIndex ? colors.primary : colors.textDim}>
          {selectedIndex === cancelIndex ? "› " : "  "}
        </Text>
        <Text color={selectedIndex === cancelIndex ? colors.primary : colors.text}>Cancel</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          <Text color={colors.highlight}>↑↓</Text> navigate  <Text color={colors.highlight}>Space</Text> toggle  <Text color={colors.highlight}>Enter</Text> select
        </Text>
      </Box>
    </Box>
  );
};
