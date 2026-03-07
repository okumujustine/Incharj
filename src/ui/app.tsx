/**
 * App Component
 * 
 * Main application component for the Incharj CLI document search tool.
 * Manages the overall application state and orchestrates the UI modes.
 * 
 * Application Modes:
 * - search: Default mode, shows search results as user types
 * - command: Activated when query starts with "/", shows command palette
 * - indexing: Shows progress bar during document indexing
 * - indexed: Shows completion summary after indexing finishes
 * 
 * Key Features:
 * - Full-text search with FTS5 SQLite
 * - Slash command system (/index, /reset, /quit, /theme)
 * - Keyboard navigation (up/down arrows, enter to open)
 * - Cross-platform file opening
 * - Multiple color themes
 * - Real-time search statistics
 */

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { execSync } from "node:child_process";
import { search } from "../search/query.js";
import { indexWithProgress, IndexResult, IndexProgress } from "../indexer/indexer.js";
import { resetDb, getDocumentCount } from "../db/db.js";
import { 
  Header, 
  SearchInput, 
  SearchResults, 
  CommandPalette, 
  IndexResults,
  ProgressBar,
  StatsFooter
} from "./components/index.js";
import { filterCommands, getCommandArgs, Command } from "../commands/index.js";
import { ThemeProvider, useTheme, themes, Theme } from "./theme/index.js";
import os from "node:os";

/** Application display modes */
type AppMode = "search" | "command" | "indexing" | "indexed";

/** Content area height for consistent vertical layout */
const CONTENT_HEIGHT = 14;

/** Minimum characters required before searching */
const MIN_SEARCH_LENGTH = 2;

/** Maximum results to fetch from database */
const MAX_SEARCH_RESULTS = 50;

/**
 * AppContent Component
 * 
 * Inner component that uses theme context.
 * Separated from App to allow ThemeProvider wrapping.
 */
function AppContent() {
  const { colors, theme, setTheme } = useTheme();
  const { stdout } = useStdout();
  const viewportWidth = stdout.columns ?? 120;
  const contentWidth = viewportWidth > 64 ? viewportWidth - 4 : viewportWidth;
  
  /** Current search/command query string */
  const [query, setQuery] = useState("");
  
  /** Current application display mode */
  const [mode, setMode] = useState<AppMode>("search");
  
  /** Selected command in command palette (for keyboard nav) */
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  /** Selected result in search results (for keyboard nav) */
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  
  /** Temporary status message (e.g., "File opened") */
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  /** Final result after indexing completes */
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  
  /** Real-time progress during indexing */
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  
  /** Total indexed document count */
  const [documentCount, setDocumentCount] = useState(0);
  
  /** Ink's exit function for /quit command */
  const { exit } = useApp();

  /** Folders to search (could be loaded from config file in future) */
  const folders = ["~/Documents", "~/Projects"];
  
  /** File extensions to index */
  const extensions = [".md", ".txt", ".json", ".yml"];

  /** Load document count on mount and after indexing */
  useEffect(() => {
    setDocumentCount(getDocumentCount());
  }, [indexResult]);

  /** Whether query is a slash command (starts with /) */
  const isCommandMode = query.startsWith("/");
  
  /** Filtered commands matching current query */
  const filteredCommands = useMemo(() => {
    if (!isCommandMode) return [];
    return filterCommands(query);
  }, [query, isCommandMode]);

  /** Reset command selection when filtered commands change */
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommands.length]);

  /** Cycles to the next theme in the list */
  const cycleTheme = useCallback(() => {
    const currentIndex = themes.findIndex((t) => t.name === theme.name);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    setTheme(nextTheme);
  }, [theme, setTheme]);

  /**
   * Executes a slash command based on its action type.
   * Handles indexing, resetting, theme switching, and quitting.
   */
  const executeCommand = useCallback((cmd: Command, args: string) => {
    switch (cmd.action) {
      case "quit":
        exit();
        break;
      
      case "theme":
        cycleTheme();
        setQuery("");
        break;
        
      case "index":
        // Start indexing with progress tracking
        setMode("indexing");
        setStatusMessage(null);
        setIndexResult(null);
        setIndexProgress(null);
        
        (async () => {
          const MIN_DURATION_MS = 3000; // Minimum 3 seconds for smooth UX
          const startTime = Date.now();
          
          try {
            // Expand ~ to actual home directory
            const roots = folders.map(f => f.replace("~", os.homedir()));
            const gen = indexWithProgress({ roots, exts: extensions });
            
            // Collect all progress updates first
            const progressUpdates: IndexProgress[] = [];
            let result: IndexResult | undefined;
            
            while (true) {
              const { value, done } = await gen.next();
              if (done) {
                result = value as IndexResult;
                break;
              }
              progressUpdates.push(value as IndexProgress);
            }
            
            // Calculate delay between each progress update
            // to spread them over at least MIN_DURATION_MS
            const totalUpdates = progressUpdates.length;
            const delayPerUpdate = totalUpdates > 0 
              ? Math.max(MIN_DURATION_MS / totalUpdates, 30) // At least 30ms per update
              : 100;
            
            // Replay progress updates with delay for smooth animation
            for (let i = 0; i < progressUpdates.length; i++) {
              setIndexProgress(progressUpdates[i]);
              await new Promise(resolve => setTimeout(resolve, delayPerUpdate));
            }
            
            // Ensure we've waited at least MIN_DURATION_MS total
            const elapsed = Date.now() - startTime;
            if (elapsed < MIN_DURATION_MS) {
              await new Promise(resolve => setTimeout(resolve, MIN_DURATION_MS - elapsed));
            }
            
            if (result) {
              setIndexResult(result);
              setMode("indexed");
              // Refresh document count after indexing
              setDocumentCount(getDocumentCount());
            }
          } catch (err) {
            setStatusMessage(`Index error: ${err}`);
            setMode("search");
          }
          setQuery("");
          setIndexProgress(null);
        })();
        break;
        
      case "reset":
        // Clear the search index
        try {
          resetDb();
          setStatusMessage("Index cleared successfully");
          setIndexResult(null);
          setDocumentCount(0);
        } catch (err) {
          setStatusMessage(`Reset error: ${err}`);
        }
        setQuery("");
        setMode("search");
        break;
        
      default:
        setQuery("");
    }
  }, [exit, folders, extensions, cycleTheme]);

  /**
   * Opens a file in the system's default application.
   * Uses platform-specific commands (open/xdg-open/start).
   */
  const openFile = useCallback((filePath: string) => {
    try {
      // Platform-specific file opener command
      const cmd = process.platform === "darwin" ? "open" : 
                  process.platform === "win32" ? "start" : "xdg-open";
      execSync(`${cmd} "${filePath}"`);
      setStatusMessage(`Opened: ${filePath.replace(os.homedir(), "~")}`);
    } catch (err) {
      setStatusMessage(`Failed to open file: ${err}`);
    }
  }, []);

  /** Memoized search results with timing */
  const { results, searchTime } = useMemo(() => {
    if (isCommandMode) {
      return { results: [], searchTime: null };
    }
    const q = query.trim();
    if (q.length < MIN_SEARCH_LENGTH) {
      return { results: [], searchTime: null };
    }
    try {
      const startTime = performance.now();
      const searchResults = search(q, MAX_SEARCH_RESULTS);
      const endTime = performance.now();
      return { results: searchResults, searchTime: endTime - startTime };
    } catch {
      return { results: [], searchTime: null };
    }
  }, [query, isCommandMode]);

  /** Reset selection when results change */
  useEffect(() => {
    setSelectedResultIndex(0);
  }, [results.length, query]);

  useInput((input, key) => {
    // Command palette navigation
    if (isCommandMode && filteredCommands.length > 0) {
      if (key.upArrow) {
        setSelectedCommandIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedCommandIndex((i) => Math.min(filteredCommands.length - 1, i + 1));
      } else if (key.return) {
        const cmd = filteredCommands[selectedCommandIndex];
        if (cmd) {
          executeCommand(cmd, getCommandArgs(query));
        }
      }
    } 
    // Search results navigation
    else if (!isCommandMode && results.length > 0) {
      if (key.upArrow) {
        setSelectedResultIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedResultIndex((i) => Math.min(results.length - 1, i + 1));
      } else if (key.return) {
        const selected = results[selectedResultIndex];
        if (selected) {
          openFile(selected.path);
        }
      }
    }
    
    // Clear status message only for text-edit interactions, not navigation/actions
    const isTextEdit = input.length > 0 || key.backspace || key.delete;
    if (statusMessage && isTextEdit) {
      setStatusMessage(null);
    }
  });

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box flexDirection="column" width={contentWidth} alignSelf="center">
        {/* Application Header */}
        <Header
          folders={folders}
          extensions={extensions}
        />

        {/* Search/Command Input */}
        <SearchInput
          query={query}
          onChange={(val) => {
            setQuery(val);
            if (mode === "indexed") setMode("search");
          }}
        />

        {/* Status Message (temporary feedback) */}
        {statusMessage && (
          <Box marginTop={1}>
            <Text color={colors.warning}>{statusMessage}</Text>
          </Box>
        )}

        {/* Dynamic Content Area */}
        {mode === "indexing" ? (
          // Indexing Progress View - prominent with border
          <Box
            height={CONTENT_HEIGHT}
            flexDirection="column"
            marginTop={2}
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
          >
            <Text bold color="cyan">Indexing documents...</Text>
            {indexProgress && (
              <>
                <Box marginTop={1}>
                  <ProgressBar
                    progress={indexProgress.current / indexProgress.total}
                    width={50}
                  />
                </Box>
                <Box marginTop={1}>
                  <Text color="yellow">{indexProgress.current}</Text>
                  <Text dimColor> of </Text>
                  <Text color="yellow">{indexProgress.total}</Text>
                  <Text dimColor> files processed</Text>
                </Box>
                <Box>
                  <Text dimColor>Current: </Text>
                  <Text color="cyan" wrap="truncate">
                    {indexProgress.file.replace(os.homedir(), "~").slice(-45)}
                  </Text>
                </Box>
              </>
            )}
          </Box>
        ) : mode === "indexed" && indexResult ? (
          // Indexing Complete View
          <Box height={CONTENT_HEIGHT} flexDirection="column" marginTop={2}>
            <IndexResults
              indexedFiles={indexResult.indexedFiles}
              skipped={indexResult.skipped}
            />
          </Box>
        ) : isCommandMode ? (
          // Command Palette View
          <Box height={CONTENT_HEIGHT} flexDirection="column" marginTop={2}>
            <CommandPalette
              commands={filteredCommands}
              selectedIndex={selectedCommandIndex}
            />
          </Box>
        ) : (
          // Search Results View (default)
          <Box height={CONTENT_HEIGHT} flexDirection="column" marginTop={2}>
            <SearchResults
              results={results}
              query={query}
              selectedIndex={selectedResultIndex}
            />
          </Box>
        )}

        {/* Stats Footer */}
        <StatsFooter
          totalDocuments={documentCount}
          searchTimeMs={results.length > 0 ? searchTime : null}
        />
      </Box>
    </Box>
  );
}

/**
 * Main Application Component
 * 
 * Wraps AppContent with ThemeProvider for theme context.
 */
export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
