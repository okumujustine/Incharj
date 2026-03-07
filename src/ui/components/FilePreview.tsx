import fs from "node:fs";
import os from "node:os";
import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/index.js";
import { TextHighlighter } from "./common/TextHighlighter.js";

interface FilePreviewProps {
  path: string;
  query: string;
  height?: number;
  maxMatches?: number;
  selectedActionIndex?: number;
}

interface MatchHint {
  lineNumber: number;
  excerpt: string;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim().replace(/^"|"$/g, ""))
    .filter((term) => term.length >= 2);
}

function markTerms(text: string, terms: string[]): string {
  if (terms.length === 0) return text;
  const pattern = terms.map(escapeRegex).join("|");
  return text.replace(new RegExp(`(${pattern})`, "gi"), "<<MATCH>>$1<<END>>");
}

function readPreview(
  filePath: string,
  query: string,
  maxMatches: number
): { hints: MatchHint[]; totalMatches: number; error?: string } {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.includes(0)) {
      return { hints: [], totalMatches: 0, error: "Binary file preview is not supported." };
    }

    const terms = buildTerms(query.toLowerCase());
    const lines = buf.toString("utf8").split(/\r?\n/);
    const hints: MatchHint[] = [];
    let totalMatches = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].replace(/\t/g, "  ");
      const lowerLine = rawLine.toLowerCase();
      const term = terms.find((t) => lowerLine.includes(t));
      if (!term) continue;
      totalMatches++;

      const index = lowerLine.indexOf(term);
      const start = Math.max(0, index - 36);
      const end = Math.min(rawLine.length, index + term.length + 52);
      const excerpt = `${start > 0 ? "..." : ""}${rawLine.slice(start, end)}${end < rawLine.length ? "..." : ""}`.slice(0, 220);

      if (hints.length < maxMatches) {
        hints.push({
          lineNumber: i + 1,
          excerpt: markTerms(excerpt, terms),
        });
      }
    }

    if (hints.length === 0) {
      const fallback = lines
        .slice(0, Math.min(maxMatches, 5))
        .map((line, i) => ({
          lineNumber: i + 1,
          excerpt: line.replace(/\t/g, "  ").slice(0, 220),
        }));
      return { hints: fallback, totalMatches: fallback.length };
    }

    return { hints, totalMatches };
  } catch (err) {
    return { hints: [], totalMatches: 0, error: `Failed to preview file: ${String(err)}` };
  }
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  path,
  query,
  height,
  maxMatches = 8,
  selectedActionIndex = 0,
}) => {
  const { colors } = useTheme();
  const displayPath = path.replace(os.homedir(), "~");
  const hintsLimit = height ? Math.max(2, Math.min(maxMatches, height - 5)) : maxMatches;
  const { hints, totalMatches, error } = readPreview(path, query, hintsLimit);
  const hiddenMatches = Math.max(0, totalMatches - hints.length);

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={height}
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
    >
      <Box width="100%">
        <Text color={colors.primary} bold>Preview </Text>
        <Text color={colors.textDim}>· </Text>
        <Box flexGrow={1}>
          <Text color={colors.text} wrap="truncate-end">{displayPath}</Text>
        </Box>
      </Box>

      <Box width="100%">
        <Text wrap="truncate-end">
          <Text color={colors.highlight}>Click</Text>
          <Text dimColor> to open file </Text>
          <Text color={colors.textDim}>· </Text>
          <Text dimColor>{totalMatches} match{totalMatches === 1 ? "" : "es"}</Text>
        </Text>
      </Box>
      <Text color={colors.textDim}>{"─".repeat(40)}</Text>

      <Box flexDirection="column" width="100%">
        {error ? (
          <Text color={colors.warning} wrap="truncate-end">{error}</Text>
        ) : hints.length === 0 ? (
          <Text dimColor>No preview hints available.</Text>
        ) : (
          <>
            {hints.map((hint, i) => (
              <Box key={`${hint.lineNumber}-${i}`} width="100%">
                <Text color={colors.textDim}>{String(hint.lineNumber).padStart(4, " ")} │ </Text>
                <Box flexGrow={1}>
                  <TextHighlighter text={hint.excerpt || " "} wrap="truncate-end" />
                </Box>
              </Box>
            ))}
            {hiddenMatches > 0 && (
              <Text color={colors.textDim} wrap="truncate-end">… +{hiddenMatches} more match{hiddenMatches > 1 ? "es" : ""}</Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
