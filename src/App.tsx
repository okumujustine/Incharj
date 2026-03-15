import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AppState, FilterType, FolderStat, IndexedFile, IndexProgress,
  IndexResult, Integration, IntegrationSyncState, Screen, SearchResult, SyncState,
} from "./types";
import ResultsList from "./components/ResultsList";
import FilesScreen from "./components/FilesScreen";
import OnboardingScreen from "./components/OnboardingScreen";
import SettingsScreen from "./components/SettingsScreen";
import IntegrationsScreen from "./components/IntegrationsScreen";
import ToastStack, { type ToastItem } from "./components/Toast";
import { getFileKind } from "./utils";

const api = window.incharjApi;

export default function App() {
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
  }, []);

  // ── Navigation ────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("search");

  // ── Global app state ──────────────────────────────────────────
  const [appState, setAppState] = useState<AppState | null>(null);

  // ── Search state ──────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState("Start with a couple of letters.");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [filter, setFilter] = useState<FilterType>("all");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeExtensions, setActiveExtensions] = useState<string[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modal state ─────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalResult, setModalResult] = useState<SearchResult | null>(null);

  // ── Index state ───────────────────────────────────────────────
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  const [lastIndexedAt, setLastIndexedAt] = useState<number | null>(null);

  // ── Toasts ────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Sync state ────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<SyncState>({
    status: "idle",
    lastCompletedAt: null,
    lastDurationMs: null,
    lastIndexed: null,
    lastError: null,
  });

  // ── Folder stats ──────────────────────────────────────────────
  const [folderStats, setFolderStats] = useState<FolderStat[]>([]);

  // ── Integrations ──────────────────────────────────────────────
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [integrationSyncStates, setIntegrationSyncStates] = useState<Record<string, IntegrationSyncState>>({});

  // ── Files state ───────────────────────────────────────────────
  const [allFiles, setAllFiles] = useState<IndexedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const filesLoadedRef = useRef(false);

  // ── Init ──────────────────────────────────────────────────────
  async function loadAppState() {
    if (!api) return;
    try {
      const state = await api.getState();
      setAppState(state);
      setActiveExtensions((prev) => prev.length > 0 ? prev.filter((ext) => state.extensions.includes(ext)) : state.extensions);
      setLastIndexedAt(state.lastIndexedAt ?? null);
    } catch {}
  }

  useEffect(() => {
    loadAppState();
    if (!api) return;
    const offProgress = api.onIndexProgress((p) => setIndexProgress(p));
    const offBackground = api.onBackgroundComplete(({ documentCount }) => {
      setAppState((prev) => prev ? { ...prev, documentCount } : prev);
    });
    const offSyncStart = api.onSyncStart(() => {
      setSyncState((prev) => ({ ...prev, status: "syncing", lastError: null }));
    });
    const offSyncComplete = api.onSyncComplete(({ documentCount, completedAt, durationMs, indexed }) => {
      setAppState((prev) => prev ? { ...prev, documentCount } : prev);
      setSyncState({ status: "done", lastCompletedAt: completedAt, lastDurationMs: durationMs, lastIndexed: indexed, lastError: null });
      setLastIndexedAt(completedAt);
      // Fade back to idle after 4 s so the "Synced" confirmation is visible but not permanent
      setTimeout(() => setSyncState((prev) => prev.status === "done" ? { ...prev, status: "idle" } : prev), 4000);
    });
    const offSyncError = api.onSyncError(({ message }) => {
      setSyncState((prev) => ({
        ...prev,
        status: "error",
        lastError: message,
      }));
      setTimeout(() => {
        setSyncState((prev) => prev.status === "error" ? { ...prev, status: "idle" } : prev);
      }, 6000);
    });
    return () => { offProgress(); offBackground(); offSyncStart(); offSyncComplete(); offSyncError(); };
  }, []);

  // ── Search ────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!api) return;
    if (q.trim().length < 2) {
      setStatus("Start with a couple of letters.");
      setResults([]);
      setSelectedIdx(-1);
      setModalOpen(false);
      return;
    }
    setIsSearching(true);
      setStatus("Looking through your files…");
    try {
      const t0 = performance.now();
      const res = await api.search(q.trim(), 50);
      const ms = Math.round(performance.now() - t0);
      setResults(res);
      setStatus(`${res.length} result${res.length !== 1 ? "s" : ""} · ${ms}ms`);
      setSelectedIdx(-1);
      setModalOpen(false);
    } catch (err) {
      setStatus(`Search failed: ${String(err)}`);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (q: string) => {
    setQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(q), 120);
  };

  // ── Filtering ─────────────────────────────────────────────────
  const filteredResults = results.filter((r) => {
    const folderMatches = activeFolder ? r.path.startsWith(activeFolder.replace("~", "/Users")) || r.path.includes(activeFolder.replace("~", "")) : true;
    const isCloud = r.source === "google_drive" || r.source === "notion";
    const extensionMatches = isCloud || (activeExtensions.length > 0 ? activeExtensions.includes(`.${r.ext.replace(/^\./, "")}`) || activeExtensions.includes(r.ext) : true);
    if (!folderMatches || !extensionMatches) return false;
    if (filter === "all") return true;
    const kind = getFileKind(r.ext);
    if (filter === "pdf")       return kind === "pdf";
    if (filter === "code")      return kind === "code";
    if (filter === "documents") return kind === "doc";
    if (filter === "recent")    return (Date.now() - r.modifiedAt) / 86_400_000 <= 7;
    return true;
  });

  const fileTypeCounts: Record<FilterType, number> = {
    all: results.length,
    documents: results.filter((r) => getFileKind(r.ext) === "doc").length,
    code: results.filter((r) => getFileKind(r.ext) === "code").length,
    pdf: results.filter((r) => getFileKind(r.ext) === "pdf").length,
    recent: results.filter((r) => (Date.now() - r.modifiedAt) / 86_400_000 <= 7).length,
  };

  const extensionCounts = results.reduce<Record<string, number>>((acc, result) => {
    const normalized = result.ext.startsWith(".") ? result.ext : `.${result.ext}`;
    acc[normalized] = (acc[normalized] ?? 0) + 1;
    return acc;
  }, {});

  // ── Modal ─────────────────────────────────────────────────────
  const openModal = (result: SearchResult, idx: number) => {
    setSelectedIdx(idx);
    setModalResult(result);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalResult(null);
  };

  const handleCopyPath = async (path: string) => {
    await navigator.clipboard.writeText(path);
    closeModal();
  };

  const handleOpenFile = async (path: string) => {
    if (api) await api.openFile(path);
    closeModal();
  };

  const handleRevealFile = async (path: string) => {
    if (api) await api.revealFile(path);
    closeModal();
  };

  // ── Keyboard navigation ───────────────────────────────────────
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (screen !== "search") return;
      if (e.key === "ArrowDown" && filteredResults.length > 0) {
        e.preventDefault();
        const next = selectedIdx < 0 ? 0 : Math.min(filteredResults.length - 1, selectedIdx + 1);
        setSelectedIdx(next);
      } else if (e.key === "ArrowUp" && filteredResults.length > 0) {
        e.preventDefault();
        const prev = selectedIdx < 0 ? 0 : Math.max(0, selectedIdx - 1);
        setSelectedIdx(prev);
      } else if (e.key === "Enter" && !modalOpen && selectedIdx >= 0) {
        e.preventDefault();
        setModalResult(filteredResults[selectedIdx]);
        setModalOpen(true);
      } else if (e.key === "Enter" && modalOpen && modalResult) {
        e.preventDefault();
        handleOpenFile(modalResult.path);
      } else if (e.key === "Escape" && modalOpen) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, filteredResults, selectedIdx, modalOpen, modalResult]);

  // ── Folder management ─────────────────────────────────────────
  const handleAddFolder = async () => {
    if (!api) return;
    const folderPath = await api.selectFolder();
    if (!folderPath) return;
    const newState = await api.addFolder(folderPath);
    setAppState(newState);
  };

  const handleRemoveFolder = async (folderPath: string) => {
    if (!api) return;
    const newState = await api.removeFolder(folderPath);
    setAppState(newState);
  };

  // ── Extension management ───────────────────────────────────────
  const handleAddExtension = async (ext: string) => {
    if (!api) return;
    const newState = await api.addExtension(ext);
    setAppState(newState);
  };

  const handleRemoveExtension = async (ext: string) => {
    if (!api) return;
    const newState = await api.removeExtension(ext);
    setAppState(newState);
  };

  const handleToggleSearchExtension = (ext: string) => {
    setActiveExtensions((prev) => prev.includes(ext) ? prev.filter((value) => value !== ext) : [...prev, ext]);
  };

  // ── Index ─────────────────────────────────────────────────────
  const handleStartIndex = async () => {
    if (!api || isIndexing) return false;
    setIsIndexing(true);
    setIndexResult(null);
    setIndexProgress(null);
    try {
      const result = await api.startIndex();
      setIndexResult(result);
      setLastIndexedAt(Date.now());
      await loadAppState();
      return true;
    } catch (err) {
      console.error("start_indexing failed:", err);
      pushToast({ type: "error", title: "Indexing failed", message: String(err), duration: 8000 });
      return false;
    } finally {
      setIsIndexing(false);
    }
  };

  const handleScanScope = async () => {
    if (!api) {
      return {
        fileCount: 0,
        totalBytes: 0,
        estimatedSeconds: 0,
        folderCount: 0,
        extensionCount: 0,
      };
    }
    const estimate = await api.scanIndexScope();
    return estimate;
  };

  const handleCompleteOnboarding = async () => {
    if (!api) return;
    const next = await api.completeOnboarding();
    setAppState(next);
    setScreen("search");
  };

  const handleConnectIntegration = async (id: string) => {
    if (!api) return;
    if (id === "google_drive") {
      await api.connectGoogleDrive();
    } else if (id === "notion") {
      await api.connectNotion();
    }
    await loadIntegrations();
  };

  const handleDisconnectIntegration = async (id: string) => {
    if (!api) return;
    await api.disconnectIntegration(id);
    await loadIntegrations();
  };

  const handleResetIntegrationSync = async (id: string) => {
    if (!api) return;
    await api.resetIntegrationSync(id);
    await loadIntegrations();
  };

  const handleSyncIntegration = async (id: string) => {
    if (!api) return;
    try {
      if (id === "google_drive") await api.syncGoogleDrive();
      else if (id === "notion") await api.syncNotion();
    } catch (err) {
      pushToast({ type: "error", title: "Sync failed", message: String(err), duration: 8000 });
    }
  };

  const handleResetIndex = async () => {
    if (!api) return;
    await api.resetIndex();
    setIndexResult(null);
    await loadAppState();
  };

  // ── Files ─────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!api) return;
    const isInitialLoad = !filesLoadedRef.current;
    if (isInitialLoad) setIsLoadingFiles(true);
    try {
      setAllFiles(await api.getFiles());
      filesLoadedRef.current = true;
    } catch {}
    finally { setIsLoadingFiles(false); }
  }, []);

  const loadIntegrations = useCallback(async () => {
    if (!api) return;
    try { setIntegrations(await api.getIntegrations()); } catch {}
  }, []);

  useEffect(() => {
    if (screen === "files") loadFiles();
    if (screen === "settings" && api) {
      api.getFolderStats().then(setFolderStats).catch(() => {});
    }
    if (screen === "integrations") loadIntegrations();
  }, [screen, loadFiles, loadIntegrations]);

  useEffect(() => {
    if (!api) return;
    const offStart = api.onIntegrationSyncStart(({ id }) => {
      setIntegrationSyncStates((prev) => ({ ...prev, [id]: { status: "syncing", indexed: null, error: null, current: 0, total: 0, fileName: "" } }));
    });
    const offProgress = api.onIntegrationSyncProgress(({ current, total, fileName }) => {
      setIntegrationSyncStates((prev) => {
        const entry = Object.entries(prev).find(([, v]) => v.status === "syncing");
        if (!entry) return prev;
        const [id] = entry;
        return { ...prev, [id]: { ...prev[id], current, total, fileName } };
      });
    });
    const offComplete = api.onIntegrationSyncComplete(({ id, indexed }) => {
      setIntegrationSyncStates((prev) => ({ ...prev, [id]: { status: "done", indexed, error: null } }));
      loadIntegrations();
      setTimeout(() => setIntegrationSyncStates((prev) => ({ ...prev, [id]: { status: "idle", indexed: null, error: null } })), 5000);
    });
    const offError = api.onIntegrationSyncError(({ id, message }) => {
      setIntegrationSyncStates((prev) => ({ ...prev, [id]: { status: "error", indexed: null, error: message } }));
      setTimeout(() => setIntegrationSyncStates((prev) => ({ ...prev, [id]: { status: "idle", indexed: null, error: null } })), 8000);
    });
    return () => { offStart(); offProgress(); offComplete(); offError(); };
  }, [loadIntegrations]);

  useEffect(() => {
    if ((appState?.extensions?.length ?? 0) > 0 && activeExtensions.length === 0) {
      setActiveExtensions(appState?.extensions ?? []);
    }
  }, [appState?.extensions]);

  // ── Search focus state ─────────────────────────────────────────
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;
  const canSearch = query.trim().length >= 2;

  // Global keyboard shortcut
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  // ── Drag ──────────────────────────────────────────────────────
  const handleDrag = (e: React.MouseEvent) => {
    if (e.button === 0) getCurrentWindow().startDragging();
  };

  // ── Render ────────────────────────────────────────────────────
  if (!appState) {
    return (
      <div className="app-shell spotlight-shell">
        <div className="title-bar" onMouseDown={handleDrag} data-tauri-drag-region>
          <span className="title-bar-name">incharj</span>
        </div>
        <div className="onboarding-shell">
          <div className="onboarding-panel">
            <header className="onboarding-header">
              <h1>Loading workspace</h1>
              <p>Preparing folders, extensions, and index status...</p>
            </header>
          </div>
        </div>
      </div>
    );
  }

  const needsOnboarding = Boolean(appState && !appState.onboardingComplete);

  if (needsOnboarding) {
    return (
      <div className="app-shell spotlight-shell">
        <div className="title-bar" onMouseDown={handleDrag} data-tauri-drag-region>
          <span className="title-bar-name">incharj</span>
        </div>
        <OnboardingScreen
          appState={appState}
          isIndexing={isIndexing}
          progress={indexProgress}
          onAddFolder={handleAddFolder}
          onRemoveFolder={handleRemoveFolder}
          onAddExtension={handleAddExtension}
          onRemoveExtension={handleRemoveExtension}
          onScanScope={handleScanScope}
          onStartIndex={handleStartIndex}
          onFinish={handleCompleteOnboarding}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="app-shell spotlight-shell">
      {/* Full-width title bar — primary drag target */}
      <div className="title-bar" onMouseDown={handleDrag} data-tauri-drag-region>
        <span className="title-bar-name">incharj</span>
      </div>

      <div className="app-body">
      {/* Navigation Rail */}
      <nav className="spotlight-nav">
        <div className="nav-items">
          <button
            className={screen === "search" ? "nav-item active" : "nav-item"}
            onClick={() => setScreen("search")}
            title="Search"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Search</span>
          </button>
          <button
            className={screen === "files" ? "nav-item active" : "nav-item"}
            onClick={() => setScreen("files")}
            title="Files"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5h14M3 10h14M3 15h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Files</span>
          </button>
          <button
            className={screen === "integrations" ? "nav-item active" : "nav-item"}
            onClick={() => setScreen("integrations")}
            title="Integrations"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="12" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="2" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="12" y="12" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span>Integrations</span>
          </button>
          <div className="nav-separator" />
          <button
            className={screen === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setScreen("settings")}
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.95 5.05l-1.41 1.41M6.46 13.54l-1.41 1.41M14.95 14.95l-1.41-1.41M6.46 6.46L5.05 5.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="spotlight-main">
        {screen === "search" && (
          <div className="files-screen">
            {/* Search Toolbar */}
            <div className="files-toolbar search-toolbar-stacked">
              <div className="filter-input-shell">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="filter-input-icon shrink-0">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="filter-input-field"
                  placeholder="Search files, code, documents..."
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {hasQuery ? (
                  <button
                    onClick={() => handleQueryChange("")}
                    className="filter-input-clear"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : (
                  <kbd className="spotlight-kbd">⌘K</kbd>
                )}
              </div>
              {hasQuery && (
                <span className="search-results-count">
                  <span className="search-results-count-value">{filteredResults.length.toLocaleString()}</span>
                  {" "}{filteredResults.length === 1 ? "result" : "results"}
                  {status.match(/(\d+ms)/) && (
                    <span className="search-results-time"> · {status.match(/(\d+ms)/)?.[1]}</span>
                  )}
                </span>
              )}
            </div>

            {/* Results */}
            <div className="files-list">
              {canSearch ? (
                <ResultsList
                  results={filteredResults}
                  selectedIdx={selectedIdx}
                  isSearching={isSearching}
                  onSelect={openModal}
                />
              ) : (
                <div className="files-empty-state">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="files-empty-icon">
                    <path d="M8 5h16l10 10v20H8V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M24 5v10h10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M14 22h12M14 27h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  <span>Type to search your files</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* File Action Modal */}
        {modalOpen && modalResult && (() => {
          const isDrive = modalResult.source === "google_drive" || modalResult.source === "notion";
          const modalName = isDrive && modalResult.displayName
            ? modalResult.displayName
            : modalResult.path.split("/").pop() ?? modalResult.path;
          return (
            <div className="modal-overlay" onClick={closeModal}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-filename">{modalName}</span>
                  <button className="modal-close" onClick={closeModal}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {!isDrive && <p className="modal-path">{modalResult.path}</p>}
                <div className="modal-actions">
                  <button className="btn-primary" onClick={() => handleOpenFile(modalResult.path)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2.5 8.5v4a1 1 0 001 1h9a1 1 0 001-1v-4M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isDrive ? "Open in Drive" : "Open"}
                  </button>
                  {!isDrive && (
                    <button className="btn-secondary" onClick={() => handleCopyPath(modalResult.path)}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Copy Path
                    </button>
                  )}
                  {!isDrive && (
                    <button className="btn-secondary" onClick={() => handleRevealFile(modalResult.path)}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 5.5h12M2 5.5v7a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-7M2 5.5l1.5-3h9l1.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Show in Finder
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {screen === "files" && (
          <FilesScreen files={allFiles} isLoading={isLoadingFiles} folders={appState?.folders ?? []} onOpen={handleOpenFile} />
        )}

        {screen === "integrations" && (
          <IntegrationsScreen
            integrations={integrations}
            syncStates={integrationSyncStates}
            onConnect={(id) => handleConnectIntegration(id)}
            onDisconnect={handleDisconnectIntegration}
            onResetSync={handleResetIntegrationSync}
            onSync={handleSyncIntegration}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen
            appState={appState}
            isIndexing={isIndexing}
            progress={indexProgress}
            result={indexResult}
            lastIndexedAt={lastIndexedAt}
            folderStats={folderStats}
            onAddFolder={handleAddFolder}
            onRemoveFolder={handleRemoveFolder}
            onAddExtension={handleAddExtension}
            onRemoveExtension={handleRemoveExtension}
            onStart={handleStartIndex}
            onReset={handleResetIndex}
          />
        )}
      </main>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
