/**
 * TextHighlighter Component
 * 
 * Renders text with highlighted portions based on special markers.
 * The SQLite FTS5 snippet() function returns text with <<MATCH>> and <<END>> 
 * markers around matched terms. This component parses those markers and 
 * renders the matched portions in a highlighted style (cyan, bold).
 * 
 * @example
 * // Input: "The <<MATCH>>quick<<END>> brown fox"
 * // Renders: "The quick brown fox" with "quick" highlighted in cyan/bold
 */

import React from "react";
import { Text } from "ink";

/** Markers inserted by SQLite FTS5 snippet() function */
const HIGHLIGHT_MARKERS = {
  /** Marks the start of a matched term */
  START: "<<MATCH>>",
  /** Marks the end of a matched term */
  END: "<<END>>",
} as const;

interface TextHighlighterProps {
  /** Text containing <<MATCH>> and <<END>> markers to highlight */
  text: string;
  /** Whether the entire text should appear dimmed (default: true) */
  dimmed?: boolean;
}

/**
 * Parses text with highlight markers and returns React elements
 * with appropriate styling applied to matched portions.
 */
function parseHighlightedText(text: string): React.ReactNode[] {
  // Split on markers while keeping them in the result for state tracking
  const parts = text.split(new RegExp(`(${HIGHLIGHT_MARKERS.START}|${HIGHLIGHT_MARKERS.END})`));
  const elements: React.ReactNode[] = [];
  let isHighlighted = false;

  parts.forEach((part, index) => {
    if (part === HIGHLIGHT_MARKERS.START) {
      // Enter highlighted state
      isHighlighted = true;
    } else if (part === HIGHLIGHT_MARKERS.END) {
      // Exit highlighted state
      isHighlighted = false;
    } else if (part) {
      // Render actual text content with appropriate styling
      elements.push(
        <Text 
          key={index} 
          color={isHighlighted ? "cyan" : undefined} 
          bold={isHighlighted}
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
  dimmed = true 
}) => {
  const highlightedElements = parseHighlightedText(text);

  return (
    <Text dimColor={dimmed}>
      {highlightedElements}
    </Text>
  );
};
