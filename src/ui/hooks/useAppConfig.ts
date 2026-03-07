/**
 * useAppConfig Hook
 * 
 * Provides application configuration values.
 * In the future, this could load from a config file (~/.incharj/config.json).
 * 
 * Currently returns default values for:
 * - folders: Directories to index and search
 * - extensions: File types to include in the index
 * 
 * @returns Configuration object with folders and extensions arrays
 */

import { useMemo } from "react";

/** Application configuration structure */
export interface AppConfig {
  /** Directories to search (supports ~ for home directory) */
  folders: string[];
  /** File extensions to index (including the dot) */
  extensions: string[];
}

/** Default folders to search if no config file exists */
const DEFAULT_FOLDERS = ["~/Documents", "~/Projects"];

/** Default file extensions to index */
const DEFAULT_EXTENSIONS = [".md", ".txt", ".json", ".yml"];

/**
 * Hook that provides application configuration.
 * Memoized to prevent unnecessary re-renders.
 */
export function useAppConfig(): AppConfig {
  return useMemo(() => ({
    folders: DEFAULT_FOLDERS,
    extensions: DEFAULT_EXTENSIONS,
  }), []);
}
