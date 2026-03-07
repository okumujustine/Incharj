/**
 * SplashScreen Component
 * 
 * Full-screen animated splash screen shown on app startup.
 * Modern, calm aesthetic with subtle animations.
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

/** Elegant ASCII Art Logo */
const LOGO = [
  "  ▀█▀ █▄ █ █▀▀ █░█ ▄▀█ █▀█ ░░█ ",
  "  ░█░ █░▀█ █▄▄ █▀█ █▀█ █▀▄ █▄█ ",
];

/** Animated loading dots */
const LOADING_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MIN_FULL_SPLASH_WIDTH = 52;
const CONTENT_MAX_WIDTH = 44;

interface SplashScreenProps {
  /** Viewport width */
  width: number;
  /** Viewport height */
  height: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ width, height }) => {
  const [frame, setFrame] = useState(0);
  const [dots, setDots] = useState(0);
  
  // Single animation loop keeps splash render stable.
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % LOADING_FRAMES.length);
      setDots((d) => (d + 1) % 4);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const compact = width < MIN_FULL_SPLASH_WIDTH;
  const contentWidth = Math.max(20, Math.min(CONTENT_MAX_WIDTH, width - 4));
  const separator = "─".repeat(Math.max(12, contentWidth));
  
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      justifyContent="center"
      alignItems="center"
    >
      <Box flexDirection="column" width={contentWidth} alignItems="center">
        <Text color="gray">{separator}</Text>

        {compact ? (
          <Box marginY={1}>
            <Text color="cyanBright" bold>INCHARJ</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginY={1} alignItems="center">
            <Text color="cyanBright" bold>{LOGO[0]}</Text>
            <Text color="cyan">{LOGO[1]}</Text>
          </Box>
        )}

        <Text color="gray">{separator}</Text>

        <Box marginTop={1}>
          <Text dimColor>Document Search Engine</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">[ </Text>
          <Text color="magenta">v0.1.0</Text>
          <Text color="gray"> ]</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="cyan">{LOADING_FRAMES[frame]} </Text>
          <Text dimColor>Initializing{".".repeat(dots)}</Text>
        </Box>
      </Box>
    </Box>
  );
};
