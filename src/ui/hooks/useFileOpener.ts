/**
 * useFileOpener Hook
 * 
 * Provides cross-platform file opening functionality.
 * Opens files in the system's default application based on file type.
 * 
 * Supported platforms:
 * - macOS: Uses 'open' command
 * - Windows: Uses 'start' command
 * - Linux: Uses 'xdg-open' command
 * 
 * @returns Function to open a file in the default application
 */

import { spawn } from "child_process";
import { platform } from "os";

/** Maps OS platform names to their respective file opener commands */
const PLATFORM_COMMANDS: Record<string, string> = {
  darwin: "open",      // macOS
  win32: "start",      // Windows
  linux: "xdg-open",   // Linux
};

/**
 * Gets the appropriate command for opening files on the current platform.
 * Falls back to 'xdg-open' for unknown platforms.
 */
function getOpenCommand(): string {
  const currentPlatform = platform();
  return PLATFORM_COMMANDS[currentPlatform] || "xdg-open";
}

interface UseFileOpenerReturn {
  /** Opens a file at the given path in the default application */
  openFile: (filePath: string) => void;
}

/**
 * Hook for opening files in the system's default application.
 * 
 * Uses platform-specific commands to open files:
 * - On macOS, opens with default app (e.g., TextEdit for .txt)
 * - On Windows, uses system associations
 * - On Linux, uses XDG associations
 * 
 * Note: The process is spawned detached, so it won't block the CLI.
 * 
 * @example
 * ```tsx
 * const { openFile } = useFileOpener();
 * openFile('/path/to/document.pdf');
 * ```
 */
export function useFileOpener(): UseFileOpenerReturn {
  const openFile = (filePath: string): void => {
    const command = getOpenCommand();
    
    // Spawn detached process so it doesn't block the CLI
    // stdio: 'ignore' prevents output from appearing in our terminal
    spawn(command, [filePath], {
      detached: true,
      stdio: "ignore",
    }).unref();
  };

  return { openFile };
}
