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

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { search } from "../search/query.js";
import { indexWithProgress, IndexResult, IndexProgress } from "../indexer/indexer.js";
import { resetDb, getDocumentCount, getIndexedFiles, IndexedFile } from "../db/db.js";
import { 
  Header, 
  SearchInput, 
  SearchResults, 
  CommandPalette, 
  IndexResults,
  ProgressBar,
  StatsFooter,
  SplashScreen,
  FilesView,
  ThemeSelector,
  FilePreview,
  IndexScopeSelector
} from "./components/index.js";
import { filterCommands, getCommandArgs, Command } from "../commands/index.js";
import { ThemeProvider, useTheme, themes, getThemeByName } from "./theme/index.js";
import { AppConfigState, loadAppConfig } from "./hooks/useAppConfig.js";
import os from "node:os";

/** Application display modes */
type AppMode = "search" | "command" | "indexing" | "indexed" | "files" | "themes" | "scope";

/** Splash screen duration in milliseconds */
const SPLASH_DURATION_MS = 2600;

/** Header height by mode (approximate lines) */
const HEADER_HEIGHTS = {
  full: 12,     // ASCII art (6) + separator (1) + tagline (1) + tips (1) + folders (1) + padding (2)
  compact: 6,   // Compact logo (3) + tagline (1) + tips (1) + folders (1)
  minimal: 2,   // Single line + margin
} as const;

/** Minimum content area height */
const MIN_CONTENT_HEIGHT = 4;

/** Height thresholds for responsive layout */
const HEIGHT_THRESHOLDS = {
  full: 30,     // Show full header if height >= 30
  compact: 20,  // Show compact header if height >= 20
} as const;

/** Width thresholds for responsive layout */
const WIDTH_THRESHOLDS = {
  full: 60,     // Show full header if width >= 60
  compact: 40,  // Show compact header if width >= 40
} as const;

/** Minimum characters required before searching */
const MIN_SEARCH_LENGTH = 2;

/** Maximum results to fetch from database */
const MAX_SEARCH_RESULTS = 50;

/** Outer layout breathing room (padding around the whole app) */
const LAYOUT_PADDING_X = 2;
const LAYOUT_PADDING_Y = 1;

/**
 * AppContent Component
 * 
 * Inner component that uses theme context.
 * Separated from App to allow ThemeProvider wrapping.
 */
function AppContent({ appConfig }: { appConfig: AppConfigState }) {
  const { colors, theme, setTheme } = useTheme();
  const { stdout } = useStdout();
  
  // Viewport dimensions (100vw, 100vh equivalent)
  const viewportWidth = stdout.columns ?? 80;
  const viewportHeight = stdout.rows ?? 24;
  const usableHeight = Math.max(viewportHeight - LAYOUT_PADDING_Y * 2, 10);
  
  // Content width uses inner viewport after app-level horizontal padding
  const contentWidth = Math.max(viewportWidth - LAYOUT_PADDING_X * 2, 20);
  
  // Always use minimal header after splash screen showed full logo
  // Only fall back to even smaller if viewport is very narrow
  const headerMode: "full" | "compact" | "minimal" = useMemo(() => {
    // After splash, always use minimal - user already saw full logo
    return "minimal";
  }, []);
  
  // Calculate content height to fill remaining viewport space (like flex-grow)
  const contentHeight = useMemo(() => {
    const headerHeight = HEADER_HEIGHTS[headerMode];
    const footerHeight = 3;  // Separator + stats row + margin
    const inputHeight = 4;   // Input margin + bordered input row
    const statusHeight = 2;  // Reserved status row (margin + single line)
    const margins = headerMode === "minimal" ? 2 : 4; // Reduced margins for compact
    const availableHeight =
      usableHeight - headerHeight - footerHeight - inputHeight - statusHeight - margins;
    return Math.max(MIN_CONTENT_HEIGHT, availableHeight);
  }, [usableHeight, headerMode]);
  
  /** Current search/command query string */
  const [query, setQuery] = useState("");
  
  /** Current application display mode */
  const [mode, setMode] = useState<AppMode>("search");
  
  /** Selected command in command palette (for keyboard nav) */
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  /** Selected result in search results (for keyboard nav) */
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  /** Show onboarding keyboard hints until the user interacts */
  const [showSearchHints, setShowSearchHints] = useState(true);

  /** Modal-style preview for selected search result path */
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewActionIndex, setPreviewActionIndex] = useState(0); // 0=open, 1=back
  const [scopeSelectedIndex, setScopeSelectedIndex] = useState(0);
  const [pendingBroadRoots, setPendingBroadRoots] = useState<string[]>([]);
  const [scopeSuggestedFolders, setScopeSuggestedFolders] = useState<string[]>([]);
  const [scopeSelectedFolders, setScopeSelectedFolders] = useState<Set<string>>(new Set());
  
  /** Temporary status message (e.g., "File opened") */
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  /** Final result after indexing completes */
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  
  /** Real-time progress during indexing */
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const indexingRunIdRef = useRef(0);
  
  /** Total indexed document count */
  const [documentCount, setDocumentCount] = useState(0);
  
  /** List of indexed files for /files view */
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  
  /** Selected file index in files view */
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  /** Selected theme index in theme picker view */
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(0);

  /** Theme active before opening picker (for cancel/revert behavior) */
  const [themePickerInitialThemeName, setThemePickerInitialThemeName] = useState<string | null>(null);
  
  /** Ink's exit function for /quit command */
  const { exit } = useApp();

  const folders = appConfig.config.folders;
  const extensions = appConfig.config.extensions;
  const ignorePatterns = appConfig.config.ignore;

  const toDisplayPath = useCallback((p: string) => p.replace(os.homedir(), "~"), []);

  const getRecommendedFolders = useCallback((): string[] => {
    const candidates = ["~/Documents", "~/Projects", "~/Desktop", "~/Downloads"];
    return candidates.filter((folder) => fs.existsSync(folder.replace("~", os.homedir())));
  }, []);

  const isBroadRoot = useCallback((rootPath: string): boolean => {
    const resolved = path.resolve(rootPath);
    if (resolved === path.parse(resolved).root) return true;
    if (/^[a-zA-Z]:[\\\/]?$/.test(resolved)) return true;
    return false;
  }, []);

  const startIndexing = useCallback((sourceFolders: string[]) => {
    const runId = ++indexingRunIdRef.current;
    setMode("indexing");
    setStatusMessage(null);
    setIndexResult(null);
    setIndexProgress({
      current: 0,
      total: 1,
      file: "Scanning folders...",
    });

    (async () => {
      try {
        const roots = sourceFolders.map(f => f.replace("~", os.homedir()));
        const gen = indexWithProgress({ roots, exts: extensions, ignore: ignorePatterns });
        let lastProgressUpdateAt = 0;
        let latestProgress: IndexProgress | null = null;

        while (true) {
          if (runId !== indexingRunIdRef.current) {
            if (typeof gen.return === "function") {
              await gen.return({ indexed: 0, skipped: 0, indexedFiles: [] });
            }
            return;
          }

          const { value, done } = await gen.next();
          if (done) {
            if (runId !== indexingRunIdRef.current) {
              return;
            }
            if (latestProgress) {
              setIndexProgress(latestProgress);
            }
            const result = value as IndexResult;
            setIndexResult(result);
            setMode("indexed");
            setDocumentCount(getDocumentCount());
            break;
          }
          const progress = value as IndexProgress;
          latestProgress = progress;
          const now = Date.now();
          const shouldRender =
            progress.current === 1 ||
            progress.current === progress.total ||
            now - lastProgressUpdateAt >= 50 ||
            progress.current % 25 === 0;

          if (shouldRender) {
            setIndexProgress(progress);
            lastProgressUpdateAt = now;
          }
        }
      } catch (err) {
        if (runId !== indexingRunIdRef.current) {
          return;
        }
        setStatusMessage(`Index error: ${err}`);
        setMode("search");
      }
      if (runId !== indexingRunIdRef.current) {
        return;
      }
      setQuery("");
      setIndexProgress(null);
    })();
  }, [extensions, ignorePatterns]);

  const cancelIndexing = useCallback(() => {
    if (mode !== "indexing") return;
    indexingRunIdRef.current += 1;
    setIndexProgress(null);
    setMode("search");
    setQuery("");
    setStatusMessage("Indexing cancelled");
  }, [mode]);

  /** Load document count on mount and after indexing */
  useEffect(() => {
    setDocumentCount(getDocumentCount());
  }, [indexResult]);

  useEffect(() => {
    if (appConfig.warnings.length > 0) {
      setStatusMessage(appConfig.warnings[0]);
      return;
    }

    const configuredThemeName = appConfig.config.theme;
    const resolvedTheme = getThemeByName(configuredThemeName);
    if (resolvedTheme.name !== configuredThemeName) {
      setStatusMessage(
        `Config theme "${configuredThemeName}" not found. Using ${resolvedTheme.displayName}.`
      );
    }
  }, [appConfig]);

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

  /** Apply/cancel theme picker selection */
  const closeThemePicker = useCallback((confirm: boolean) => {
    if (confirm) {
      const selectedTheme = themes[selectedThemeIndex];
      if (selectedTheme) {
        setTheme(selectedTheme);
        setStatusMessage(`Theme changed to ${selectedTheme.displayName}`);
      }
    } else if (themePickerInitialThemeName) {
      setTheme(getThemeByName(themePickerInitialThemeName));
    }

    setThemePickerInitialThemeName(null);
    setMode("search");
  }, [selectedThemeIndex, themePickerInitialThemeName, setTheme]);

  /** Live theme preview while moving through theme picker options */
  useEffect(() => {
    if (mode !== "themes") return;
    const previewTheme = themes[selectedThemeIndex];
    if (previewTheme && previewTheme.name !== theme.name) {
      setTheme(previewTheme);
    }
  }, [mode, selectedThemeIndex, theme.name, setTheme]);

  /**
   * Executes a slash command based on its action type.
   * Handles indexing, resetting, theme switching, and quitting.
   */
  const executeCommand = useCallback((cmd: Command, args: string) => {
    switch (cmd.action) {
      case "quit":
        exit();
        break;
      
      case "files":
        // Show indexed files list
        setIndexedFiles(getIndexedFiles());
        setSelectedFileIndex(0);
        setMode("files");
        setQuery("");
        break;
      
      case "theme":
        setThemePickerInitialThemeName(theme.name);
        setSelectedThemeIndex(Math.max(0, themes.findIndex((t) => t.name === theme.name)));
        setMode("themes");
        setQuery("");
        break;

      case "config":
        setStatusMessage(
          `Config: ${appConfig.configPath} · folders ${folders.length} · exts ${extensions.length}`
        );
        setQuery("");
        setMode("search");
        break;
        
      case "index":
        const expanded = folders.map((f) => f.replace("~", os.homedir()));
        const broad = expanded.filter(isBroadRoot);
        if (broad.length > 0) {
          const suggested = getRecommendedFolders();
          setPendingBroadRoots(broad.map(toDisplayPath));
          setScopeSuggestedFolders(suggested);
          setScopeSelectedFolders(new Set(suggested));
          setScopeSelectedIndex(0);
          setMode("scope");
          setQuery("");
          break;
        }
        startIndexing(folders);
        break;
        
      case "reset":
        // Clear the search index and screen
        try {
          resetDb();
          // Clear terminal screen
          process.stdout.write("\x1b[2J\x1b[H");
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
  }, [appConfig.configPath, exit, folders, getRecommendedFolders, isBroadRoot, startIndexing, theme.name, toDisplayPath]);

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

  const selectedResult = results[selectedResultIndex] ?? null;
  const previewModalHeight = Math.max(8, contentHeight);
  const previewModalWidth = Math.max(48, Math.min(120, contentWidth - 10));

  /** Reset selection when results change */
  useEffect(() => {
    setSelectedResultIndex(0);
  }, [results.length, query]);

  useInput((input, key) => {
    const hasUserInteracted =
      input.length > 0 || key.backspace || key.delete || key.upArrow || key.downArrow || key.return;
    if (showSearchHints && hasUserInteracted) {
      setShowSearchHints(false);
    }

    // Search preview modal controls
    if (previewPath) {
      if (key.leftArrow) {
        setPreviewActionIndex((i) => Math.max(0, i - 1));
      } else if (key.rightArrow || key.tab) {
        setPreviewActionIndex((i) => Math.min(1, i + 1));
      } else if (key.return) {
        if (previewActionIndex === 0) {
          openFile(previewPath);
        } else {
          setPreviewPath(null);
        }
      } else if (input.toLowerCase() === "o") {
        openFile(previewPath);
      } else if (key.escape || input === "q") {
        setPreviewPath(null);
      }
      return;
    }

    if (mode === "indexing") {
      if (key.escape || input === "q") {
        cancelIndexing();
      }
      return;
    }

    // Theme picker navigation
    if (mode === "themes") {
      if (key.upArrow) {
        setSelectedThemeIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedThemeIndex((i) => Math.min(themes.length - 1, i + 1));
      } else if (key.return) {
        closeThemePicker(true);
      } else if (key.escape || input === "q") {
        closeThemePicker(false);
      }
      return;
    }

    // Broad scope warning/select view
    if (mode === "scope") {
      const firstFolderIndex = 1;
      const startSelectedIndex = firstFolderIndex + scopeSuggestedFolders.length;
      const cancelIndex = startSelectedIndex + 1;
      const maxIndex = cancelIndex;

      if (key.upArrow) {
        setScopeSelectedIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setScopeSelectedIndex((i) => Math.min(maxIndex, i + 1));
      } else if (input === " ") {
        if (scopeSelectedIndex >= firstFolderIndex && scopeSelectedIndex < startSelectedIndex) {
          const folder = scopeSuggestedFolders[scopeSelectedIndex - firstFolderIndex];
          if (folder) {
            setScopeSelectedFolders((prev) => {
              const next = new Set(prev);
              if (next.has(folder)) next.delete(folder);
              else next.add(folder);
              return next;
            });
          }
        }
      } else if (key.return) {
        if (scopeSelectedIndex === 0) {
          startIndexing(pendingBroadRoots.length > 0 ? pendingBroadRoots : folders);
        } else if (scopeSelectedIndex >= firstFolderIndex && scopeSelectedIndex < startSelectedIndex) {
          const folder = scopeSuggestedFolders[scopeSelectedIndex - firstFolderIndex];
          if (folder) {
            setScopeSelectedFolders((prev) => {
              const next = new Set(prev);
              if (next.has(folder)) next.delete(folder);
              else next.add(folder);
              return next;
            });
          }
        } else if (scopeSelectedIndex === startSelectedIndex) {
          const selected = scopeSuggestedFolders.filter((folder) => scopeSelectedFolders.has(folder));
          if (selected.length === 0) {
            setStatusMessage("Select at least one folder before starting.");
          } else {
            setStatusMessage(`Using selected folders (${selected.length}) instead of whole-disk root.`);
            startIndexing(selected);
          }
        } else if (scopeSelectedIndex === cancelIndex) {
          setMode("search");
        }
      } else if (key.escape || input === "q") {
        setMode("search");
      }
      return;
    }

    // Files view navigation
    if (mode === "files") {
      if (key.upArrow) {
        setSelectedFileIndex((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedFileIndex((i) => Math.min(indexedFiles.length - 1, i + 1));
      } else if (key.return) {
        const selected = indexedFiles[selectedFileIndex];
        if (selected) {
          openFile(selected.path);
        }
      } else if (key.escape || input === "q") {
        setMode("search");
      }
      return;
    }
    
    // Command palette navigation
    if (isCommandMode && filteredCommands.length > 0) {
      const commandCount = filteredCommands.length;
      if (key.upArrow) {
        setSelectedCommandIndex((i) => (i - 1 + commandCount) % commandCount);
      } else if (key.downArrow) {
        setSelectedCommandIndex((i) => (i + 1) % commandCount);
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
          setPreviewPath(selected.path);
          setPreviewActionIndex(0);
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
    <Box
      flexDirection="column"
      width={viewportWidth}
      height={viewportHeight}
      paddingX={LAYOUT_PADDING_X}
      paddingY={LAYOUT_PADDING_Y}
    >
      <Box flexDirection="column" width={contentWidth} alignSelf="center" height="100%">
        {/* Application Header */}
        <Header
          folders={folders}
          extensions={extensions}
          mode={headerMode}
          maxWidth={contentWidth}
        />

        {/* Search/Command Input */}
        <SearchInput
          query={query}
          onChange={(val) => {
            setQuery(val);
            if (previewPath) {
              setPreviewPath(null);
            }
            // Leave transient views when user starts typing a new query/command.
            if (mode === "themes") {
              closeThemePicker(false);
            } else if (mode === "indexed" || mode === "files") {
              setMode("search");
            }
          }}
          onSubmit={() => {
            if (mode === "scope") {
              return;
            }
            if (isCommandMode && filteredCommands.length > 0) {
              const cmd = filteredCommands[selectedCommandIndex];
              if (cmd) {
                executeCommand(cmd, getCommandArgs(query));
              }
              return;
            }
            if (!isCommandMode && results.length > 0) {
              const selected = results[selectedResultIndex];
              if (selected) {
                setPreviewPath(selected.path);
                setPreviewActionIndex(0);
              }
            }
          }}
          width={contentWidth}
        />

        {/* Status row (always reserved to avoid layout shift) */}
        <Box height={1}>
          {statusMessage ? (
            <Text color={colors.warning} wrap="truncate">
              {statusMessage}
            </Text>
          ) : (
            <Text dimColor> </Text>
          )}
        </Box>

        {/* Dynamic Content Area - fills remaining space */}
        {mode === "indexing" ? (
          // Indexing Progress View - prominent with border
          <Box
            height={contentHeight}
            flexDirection="column"
            marginTop={1}
            borderStyle="round"
            borderColor={colors.border}
            paddingX={1}
          >
            <Text bold color={colors.primary}>Indexing documents...</Text>
            <Text dimColor>Press Esc or q to cancel</Text>
            {indexProgress && (
              <>
                <Box marginTop={1}>
                  <ProgressBar
                    progress={indexProgress.current / indexProgress.total}
                    width={Math.min(50, contentWidth - 6)}
                  />
                </Box>
                <Box marginTop={1}>
                  <Text color={colors.highlight}>{indexProgress.current}</Text>
                  <Text dimColor> of </Text>
                  <Text color={colors.highlight}>{indexProgress.total}</Text>
                  <Text dimColor> files</Text>
                </Box>
                {contentHeight > 6 && (
                  <Box>
                    <Text dimColor>Current: </Text>
                    <Text color={colors.primary} wrap="truncate">
                      {indexProgress.file.replace(os.homedir(), "~").slice(-(contentWidth - 12))}
                    </Text>
                  </Box>
                )}
              </>
            )}
          </Box>
        ) : mode === "indexed" && indexResult ? (
          // Indexing Complete View
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            <IndexResults
              indexedFiles={indexResult.indexedFiles}
              skipped={indexResult.skipped}
            />
          </Box>
        ) : mode === "files" ? (
          // Files List View
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            <FilesView
              files={indexedFiles}
              selectedIndex={selectedFileIndex}
              maxHeight={contentHeight - 2}
            />
          </Box>
        ) : mode === "themes" ? (
          // Theme Picker View
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            <ThemeSelector
              themes={themes}
              selectedIndex={selectedThemeIndex}
            />
          </Box>
        ) : mode === "scope" ? (
          // Index Scope Warning / Selection
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            <IndexScopeSelector
              broadRoots={pendingBroadRoots}
              suggestedFolders={scopeSuggestedFolders}
              selectedFolders={scopeSelectedFolders}
              selectedIndex={scopeSelectedIndex}
            />
          </Box>
        ) : isCommandMode ? (
          // Command Palette View
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            <CommandPalette
              commands={filteredCommands}
              selectedIndex={selectedCommandIndex}
            />
          </Box>
        ) : (
          // Search Results View (default)
          <Box height={contentHeight} flexDirection="column" marginTop={1}>
            {previewPath && (
              <Box height={contentHeight} justifyContent="center" alignItems="center">
                <Box width={previewModalWidth} height={previewModalHeight}>
                  <FilePreview
                    path={previewPath}
                    query={query}
                    height={previewModalHeight}
                    maxMatches={Math.max(3, previewModalHeight - 5)}
                    selectedActionIndex={previewActionIndex}
                  />
                </Box>
              </Box>
            )}
            {!previewPath && (
              <SearchResults
                results={results}
                query={query}
                selectedIndex={selectedResultIndex}
                showHints={showSearchHints}
                maxHeight={contentHeight}
              />
            )}
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
 * Shows splash screen on startup before main app.
 */
export function App() {
  const { stdout } = useStdout();
  const [showSplash, setShowSplash] = useState(true);
  const appConfig = useMemo(() => loadAppConfig(), []);
  
  const viewportWidth = stdout.columns ?? 80;
  const viewportHeight = stdout.rows ?? 24;
  
  // Auto-dismiss splash screen after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);
  
  if (showSplash) {
    return (
      <SplashScreen width={viewportWidth} height={viewportHeight} />
    );
  }
  
  return (
    <ThemeProvider initialTheme={getThemeByName(appConfig.config.theme)}>
      <AppContent appConfig={appConfig} />
    </ThemeProvider>
  );
}
