/**
 * Theme System for Incharj
 * 
 * Provides color schemes for the entire application.
 * Themes define colors for various UI elements including:
 * - Primary/accent colors
 * - Text colors (normal, dim, bold)
 * - Status colors (success, warning, error)
 * - UI element colors (borders, highlights)
 * 
 * Usage:
 * ```tsx
 * import { useTheme, ThemeProvider } from './theme';
 * const { colors } = useTheme();
 * <Text color={colors.primary}>Hello</Text>
 * ```
 */

import React, { createContext, useContext, useState, ReactNode } from "react";

/** Color definitions for a theme */
export interface ThemeColors {
  /** Primary brand color (cyan by default) */
  primary: string;
  /** Secondary accent color (magenta by default) */
  accent: string;
  /** Success state color */
  success: string;
  /** Warning state color */
  warning: string;
  /** Error state color */
  error: string;
  /** Normal text color */
  text: string;
  /** Dimmed/muted text color */
  textDim: string;
  /** Border color for boxes */
  border: string;
  /** Highlight color for matched search terms */
  highlight: string;
  /** Selected item background indicator */
  selection: string;
}

/** Theme definition including name and colors */
export interface Theme {
  /** Unique theme identifier */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Color palette */
  colors: ThemeColors;
}

/** Default cyan theme - clean and professional */
export const cyanTheme: Theme = {
  name: "cyan",
  displayName: "Cyan (Default)",
  colors: {
    primary: "cyan",
    accent: "magenta",
    success: "green",
    warning: "yellow",
    error: "red",
    text: "white",
    textDim: "gray",
    border: "cyan",
    highlight: "cyan",
    selection: "blue",
  },
};

/** Vibrant theme - colorful and energetic */
export const vibrantTheme: Theme = {
  name: "vibrant",
  displayName: "Vibrant",
  colors: {
    primary: "magenta",
    accent: "yellow",
    success: "greenBright",
    warning: "yellowBright",
    error: "redBright",
    text: "white",
    textDim: "gray",
    border: "magenta",
    highlight: "yellow",
    selection: "magentaBright",
  },
};

/** Minimal theme - subtle and distraction-free */
export const minimalTheme: Theme = {
  name: "minimal",
  displayName: "Minimal",
  colors: {
    primary: "white",
    accent: "gray",
    success: "green",
    warning: "yellow",
    error: "red",
    text: "white",
    textDim: "gray",
    border: "gray",
    highlight: "white",
    selection: "gray",
  },
};

/** Monochrome theme - classic terminal look */
export const monochromeTheme: Theme = {
  name: "monochrome",
  displayName: "Monochrome",
  colors: {
    primary: "green",
    accent: "greenBright",
    success: "green",
    warning: "green",
    error: "greenBright",
    text: "green",
    textDim: "greenBright",
    border: "green",
    highlight: "greenBright",
    selection: "green",
  },
};

/** Ocean theme - calm blue tones */
export const oceanTheme: Theme = {
  name: "ocean",
  displayName: "Ocean",
  colors: {
    primary: "blueBright",
    accent: "cyanBright",
    success: "greenBright",
    warning: "yellowBright",
    error: "redBright",
    text: "white",
    textDim: "gray",
    border: "blueBright",
    highlight: "cyanBright",
    selection: "blue",
  },
};

/** All available themes */
export const themes: Theme[] = [
  cyanTheme,
  vibrantTheme,
  minimalTheme,
  monochromeTheme,
  oceanTheme,
];

/** Get theme by name, falls back to cyan */
export function getThemeByName(name: string): Theme {
  return themes.find((t) => t.name === name) ?? cyanTheme;
}

/** Theme context type */
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colors: ThemeColors;
}

/** Theme context for components */
const ThemeContext = createContext<ThemeContextType>({
  theme: cyanTheme,
  setTheme: () => {},
  colors: cyanTheme.colors,
});

/** Theme provider props */
interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: Theme;
}

/**
 * ThemeProvider Component
 * 
 * Wraps the app to provide theme context to all children.
 */
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  initialTheme = cyanTheme 
}) => {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, colors: theme.colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * useTheme Hook
 * 
 * Access current theme and colors from any component.
 */
export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
