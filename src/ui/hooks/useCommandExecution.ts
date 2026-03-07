/**
 * useCommandExecution Hook
 * 
 * Handles execution of slash commands (/index, /reset, /quit).
 * Each command has specific behavior for managing the search index.
 * 
 * Available Commands:
 * - /index: Re-scans configured folders and rebuilds the search index
 * - /reset: Clears all indexed data from the database
 * - /quit: Exits the application
 * 
 * @returns Command execution state and handlers
 */

import { useState, useCallback } from "react";
import { indexWithProgress, IndexResult, IndexProgress } from "../../indexer/indexer.js";
import { resetDb } from "../../db/db.js";
import os from "node:os";

/** Valid slash commands the application supports */
type SlashCommand = "/index" | "/reset" | "/quit";

/** Progress information during indexing operation */
export interface IndexingProgress {
  /** Current file being indexed */
  current: number;
  /** Total number of files to index */
  total: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Name of current file being processed */
  fileName: string;
}

interface UseCommandExecutionOptions {
  /** Folders to scan when indexing */
  folders: string[];
  /** File extensions to include when indexing */
  extensions: string[];
  /** Callback when command execution completes */
  onComplete?: () => void;
  /** Callback to exit the application */
  onExit: () => void;
}

interface UseCommandExecutionReturn {
  /** Whether an indexing operation is in progress */
  isIndexing: boolean;
  /** Progress information during indexing (null when not indexing) */
  indexingProgress: IndexingProgress | null;
  /** Status message to display (e.g., "Index cleared") */
  statusMessage: string;
  /** Executes a slash command */
  executeCommand: (query: string) => Promise<void>;
  /** Checks if a query is a valid slash command */
  isValidCommand: (query: string) => boolean;
}

/**
 * Hook for executing slash commands in the CLI.
 * 
 * Manages the state of long-running operations (like indexing)
 * and provides progress feedback for UI updates.
 * 
 * @example
 * ```tsx
 * const { isIndexing, indexingProgress, executeCommand } = useCommandExecution({
 *   folders: ['/home/user/docs'],
 *   extensions: ['.md', '.txt'],
 *   onExit: () => exit()
 * });
 * ```
 */
export function useCommandExecution({
  folders,
  extensions,
  onComplete,
  onExit,
}: UseCommandExecutionOptions): UseCommandExecutionReturn {
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState<IndexingProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  /**
   * Checks if the given query matches a valid slash command.
   */
  const isValidCommand = useCallback((query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase();
    return ["/index", "/reset", "/quit"].includes(normalizedQuery as SlashCommand);
  }, []);

  /**
   * Displays a temporary status message that auto-clears after a delay.
   */
  const showTemporaryStatus = useCallback((message: string, durationMs = 2000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), durationMs);
  }, []);

  /**
   * Executes the /index command - re-scans folders and rebuilds search index.
   */
  const executeIndexCommand = useCallback(async () => {
    setIsIndexing(true);
    setIndexingProgress({ current: 0, total: 0, percentage: 0, fileName: "" });

    try {
      // Expand ~ to home directory for indexer
      const roots = folders.map(f => f.replace("~", os.homedir()));
      const exts = extensions;

      // Use async generator for real-time progress updates
      const gen = indexWithProgress({ roots, exts });
      
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          // Final value is IndexResult, indexing complete
          break;
        }
        // Progress updates during indexing
        const progress = value as IndexProgress;
        setIndexingProgress({
          current: progress.current,
          total: progress.total,
          percentage: progress.total > 0 
            ? Math.round((progress.current / progress.total) * 100)
            : 0,
          fileName: progress.file.replace(os.homedir(), "~"),
        });
      }
      showTemporaryStatus("Indexing complete!");
    } catch (error) {
      showTemporaryStatus("Indexing failed - check console for details");
      console.error("Indexing error:", error);
    } finally {
      setIsIndexing(false);
      setIndexingProgress(null);
      onComplete?.();
    }
  }, [folders, extensions, showTemporaryStatus, onComplete]);

  /**
   * Executes the /reset command - clears all indexed data.
   */
  const executeResetCommand = useCallback(() => {
    resetDb();
    showTemporaryStatus("Index cleared");
    onComplete?.();
  }, [showTemporaryStatus, onComplete]);

  /**
   * Executes the /quit command - exits the application.
   */
  const executeQuitCommand = useCallback(() => {
    onExit();
  }, [onExit]);

  /**
   * Main command dispatcher - routes to the appropriate handler.
   */
  const executeCommand = useCallback(async (query: string): Promise<void> => {
    const command = query.trim().toLowerCase() as SlashCommand;

    switch (command) {
      case "/index":
        await executeIndexCommand();
        break;
      case "/reset":
        executeResetCommand();
        break;
      case "/quit":
        executeQuitCommand();
        break;
      default:
        showTemporaryStatus(`Unknown command: ${query}`);
    }
  }, [executeIndexCommand, executeResetCommand, executeQuitCommand, showTemporaryStatus]);

  return {
    isIndexing,
    indexingProgress,
    statusMessage,
    executeCommand,
    isValidCommand,
  };
}
