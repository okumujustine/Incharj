/**
 * TextHighlighter Component
 * 
 * Renders text with highlighted portions based on special markers.
 * The SQLite FTS5 snippet() function returns text with <<MATCH>> and <<END>> 
 * markers around matched terms.
 */

import React from "react";
import { Text } from "ink";
import { useTheme } from "../../theme/index.js";

/** Markers inserted by SQLite FTS5 snippet() function */
const HIGHLIGHT_MARKERS = {
  START: "<<MATCH>>",
  END: "<<END>>",
} as const;

interface TextHighlighterProps {
  /** Text containing <<MATCH>> and <<END>> markers to highlight */
  text: string;
  /** Whether the entire text should appear dimmed (default: true) */
  dimmed?: boolean;
  /** Wrapping strategy for the rendered text */
  wrap?: "wrap" | "truncate" | "truncate-end";
}

/**
 * Parses text with highlight markers and returns React elements
 */
function parseHighlightedText(text: string, highlightColor: string): React.ReactNode[] {
  const parts = text.split(new RegExp(`(${HIGHLIGHT_MARKERS.START}|${HIGHLIGHT_MARKERS.END})`));
  const elements: React.ReactNode[] = [];
  let isHighlighted = false;

  parts.forEach((part, index) => {
    if (part === HIGHLIGHT_MARKERS.START) {
      isHighlighted = true;
    } else if (part === HIGHLIGHT_MARKERS.END) {
      isHighlighted = false;
    } else if (part) {
      elements.push(
        <Text 
          key={index} 
          color={isHighlighted ? highlightColor : undefined} 
          bold={isHighlighted}
          dimColor={!isHighlighted}
        >
          {part}
        </Text>
      );
    }
  });

  return elements;
}

export const TextHighlighter: React.FC<TextHighlighterProps> = ({ 
  text, 
  wrap = "wrap",
}) => {
  const { colors } = useTheme();
  const highlightedElements = parseHighlightedText(text, colors.highlight);

  return (
    <Text wrap={wrap}>
      {highlightedElements}
    </Text>
  );
};
