/**
 * QuickTips Component
 * 
 * Displays helpful keyboard shortcuts and commands to new users.
 * Provides at-a-glance reference for common operations.
 * 
 * Visual layout:
 * Tip: /index to scan folders, /quit to exit
 */

import React from "react";
import { Box, Text } from "ink";

/** Quick tips to display - these are the most commonly used commands */
const TIPS = [
  { command: "/index", description: "to scan folders" },
  { command: "/quit", description: "to exit" },
] as const;

export const QuickTips: React.FC = () => (
  <Box marginTop={1}>
    <Text dimColor>Tip: </Text>
    {TIPS.map((tip, index) => (
      <React.Fragment key={tip.command}>
        <Text color="cyan">{tip.command}</Text>
        <Text dimColor> {tip.description}</Text>
        {/* Add separator between tips, but not after the last one */}
        {index < TIPS.length - 1 && <Text dimColor>, </Text>}
      </React.Fragment>
    ))}
  </Box>
);
