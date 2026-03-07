/**
 * AppBranding Component
 * 
 * Displays the application name with a stunning ASCII art header.
 * This is the primary visual identity element of the CLI.
 */

import React from "react";
import { Box, Text } from "ink";

/** Application metadata */
const APP_INFO = {
  VERSION: "0.1.0",
  TAGLINE: "Search documents by keyword",
} as const;

/** ASCII Art Logo */
const LOGO = [
  "██╗███╗   ██╗ ██████╗██╗  ██╗ █████╗ ██████╗      ██╗",
  "██║████╗  ██║██╔════╝██║  ██║██╔══██╗██╔══██╗     ██║",
  "██║██╔██╗ ██║██║     ███████║███████║██████╔╝     ██║",
  "██║██║╚██╗██║██║     ██╔══██║██╔══██║██╔══██╗██   ██║",
  "██║██║ ╚████║╚██████╗██║  ██║██║  ██║██║  ██║╚█████╔╝",
  "╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝ ",
];

const COLORS = ["cyan", "cyanBright", "white", "cyanBright", "cyan", "blue"] as const;

export const AppBranding: React.FC = () => {
  const logoWidth = LOGO[0].length;
  const separator = "━".repeat(logoWidth);
  
  return (
    <Box flexDirection="column" paddingY={1} width="100%" alignItems="center">
      {/* ASCII Art with gradient effect */}
      <Box flexDirection="column" width={logoWidth}>
        {LOGO.map((line, i) => (
          <Text key={i} color={COLORS[i]}>{line}</Text>
        ))}
      </Box>
      
      {/* Separator matching logo width */}
      <Box width={logoWidth}>
        <Text color="gray">{separator}</Text>
      </Box>
      
      {/* Tagline and version inline */}
      <Box width={logoWidth} justifyContent="space-between">
        <Text color="white" dimColor>{APP_INFO.TAGLINE}</Text>
        <Text color="magenta" bold>v{APP_INFO.VERSION}</Text>
      </Box>
    </Box>
  );
};
