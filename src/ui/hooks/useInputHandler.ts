/**
 * useInputHandler Hook
 * 
 * Manages the text input state and handles submission logic.
 * Coordinates between command execution and file opening based on context.
 * 
 * Submission Behavior:
 * - If query is a slash command → Execute the command
 * - If there are search results → Open the selected file
 * - Otherwise → Do nothing
 * 
 * @returns Input state and handlers
 */

import { useState, useCallback } from "react";
import { SearchResult } from "../../search/query.js";

interface UseInputHandlerOptions {
  /** Function to open a file path */
  openFile: (filePath: string) => void;
  /** Function to execute a slash command */
  executeCommand: (query: string) => Promise<void>;
  /** Function to check if query is a valid command */
  isValidCommand: (query: string) => boolean;
  /** Current search results */
  results: SearchResult[];
  /** Currently selected result index */
  selectedIndex: number;
}

interface UseInputHandlerReturn {
  /** Current query string */
  query: string;
  /** Updates the query string */
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  /** Handles form submission (Enter key) */
  handleSubmit: () => void;
}

/**
 * Hook for managing search input and submission behavior.
 * 
 * Determines the appropriate action on Enter key:
 * 1. Execute command if query starts with /
 * 2. Open selected file if search results exist
 * 3. Ignore otherwise
 * 
 * Clears the query after successful command execution.
 * 
 * @example
 * ```tsx
 * const { query, setQuery, handleSubmit } = useInputHandler({
 *   openFile,
 *   executeCommand,
 *   isValidCommand,
 *   results,
 *   selectedIndex
 * });
 * ```
 */
export function useInputHandler({
  openFile,
  executeCommand,
  isValidCommand,
  results,
  selectedIndex,
}: UseInputHandlerOptions): UseInputHandlerReturn {
  const [query, setQuery] = useState("");

  /**
   * Handles the Enter key submission.
   * Routes to command execution or file opening based on context.
   */
  const handleSubmit = useCallback(async () => {
    const trimmedQuery = query.trim();

    // Handle slash commands
    if (trimmedQuery.startsWith("/")) {
      if (isValidCommand(trimmedQuery)) {
        await executeCommand(trimmedQuery);
        setQuery(""); // Clear input after command
      }
      return;
    }

    // Handle file opening (if results exist and one is selected)
    if (results.length > 0 && selectedIndex >= 0 && selectedIndex < results.length) {
      const selectedResult = results[selectedIndex];
      openFile(selectedResult.path);
    }
  }, [query, results, selectedIndex, openFile, executeCommand, isValidCommand]);

  return {
    query,
    setQuery,
    handleSubmit,
  };
}
