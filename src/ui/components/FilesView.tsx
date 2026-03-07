/**
 * FilesView Component
 * 
 * Modern, clean display of indexed files with their metadata.
 * Shows path, extension, size, and when each file was indexed.
 */

import React from "react";
import { Box, Text } from "ink";
import os from "node:os";
import { useTheme } from "../theme/index.js";

export interface IndexedFileDisplay {
  path: string;
  ext: string;
  sizeBytes: number;
  indexedAt: Date;
}

interface FilesViewProps {
  files: IndexedFileDisplay[];
  selectedIndex: number;
  maxHeight?: number;
}

/** Format bytes to human readable */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format date to relative time */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}

/** Shorten path by replacing home dir with ~ */
function shortenPath(filePath: string, maxLen: number): string {
  let shortened = filePath.replace(os.homedir(), "~");
  if (shortened.length > maxLen) {
    shortened = "..." + shortened.slice(-(maxLen - 3));
  }
  return shortened;
}

export const FilesView: React.FC<FilesViewProps> = ({ files, selectedIndex, maxHeight = 10 }) => {
  const { colors } = useTheme();

  if (files.length === 0) {
    return (
      <Box flexDirection="column" paddingY={2} alignItems="center">
        <Text color={colors.textDim}>─────────────────────</Text>
        <Box marginY={1}>
          <Text color={colors.warning}>○</Text>
          <Text color={colors.text} bold> No files indexed yet</Text>
        </Box>
        <Box>
          <Text dimColor>Use </Text>
          <Text color={colors.primary}>/index</Text>
          <Text dimColor> to scan documents</Text>
        </Box>
        <Text color={colors.textDim}>─────────────────────</Text>
      </Box>
    );
  }

  // Calculate visible range for scrolling
  const halfVisible = Math.floor(maxHeight / 2);
  let startIndex = Math.max(0, selectedIndex - halfVisible);
  const endIndex = Math.min(files.length, startIndex + maxHeight);
  
  // Adjust start if we're near the end
  if (endIndex === files.length) {
    startIndex = Math.max(0, files.length - maxHeight);
  }
  
  const visibleFiles = files.slice(startIndex, endIndex);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={colors.primary}>◆</Text>
        <Text color={colors.text} bold> Indexed Files </Text>
        <Text color={colors.textDim}>·</Text>
        <Text color={colors.accent}> {files.length}</Text>
      </Box>
      
      {/* Separator */}
      <Box marginBottom={1}>
        <Text color={colors.textDim}>{"─".repeat(70)}</Text>
      </Box>
      
      {/* File list */}
      {visibleFiles.map((file, i) => {
        const actualIndex = startIndex + i;
        const isSelected = actualIndex === selectedIndex;
        
        return (
          <Box key={file.path} paddingLeft={1}>
            <Text color={isSelected ? colors.primary : colors.textDim}>
              {isSelected ? "› " : "  "}
            </Text>
            <Box width={50}>
              <Text color={isSelected ? colors.text : colors.textDim} wrap="truncate">
                {shortenPath(file.path, 48)}
              </Text>
            </Box>
            <Box width={10} justifyContent="flex-end">
              <Text color={colors.textDim} dimColor>{formatBytes(file.sizeBytes)}</Text>
            </Box>
            <Box width={8} justifyContent="flex-end">
              <Text color={isSelected ? colors.highlight : colors.textDim} dimColor>{formatRelativeTime(file.indexedAt)}</Text>
            </Box>
          </Box>
        );
      })}
      
      {/* Footer with scroll indicator */}
      {files.length > maxHeight && (
        <Box marginTop={1}>
          <Text color={colors.textDim}>{"─".repeat(70)}</Text>
        </Box>
      )}
      {files.length > maxHeight && (
        <Box paddingLeft={1}>
          <Text dimColor>
            {startIndex + 1}–{endIndex} of {files.length}
          </Text>
          <Text color={colors.textDim}> · </Text>
          <Text dimColor>↑↓ navigate</Text>
        </Box>
      )}
    </Box>
  );
};
