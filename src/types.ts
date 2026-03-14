export type Screen = "search" | "files" | "integrations" | "settings";

export type FilterType = "all" | "documents" | "code" | "pdf" | "recent";

export interface SearchResult {
  path: string;
  ext: string;
  snippet: string;
  modifiedAt: number;
  score?: number;
  displayName?: string;
  source?: string;
}

export interface IndexedFile {
  path: string;
  ext: string;
  modifiedAt: number;
  displayName?: string;
  source?: string;
}

export interface AppState {
  configPath: string;
  folders: string[];
  extensions: string[];
  ignore: string[];
  documentCount: number;
  lastIndexedAt: number | null;
  onboardingComplete: boolean;
}

export interface IndexScopeEstimate {
  fileCount: number;
  totalBytes: number;
  estimatedSeconds: number;
  folderCount: number;
  extensionCount: number;
}

export interface ScanProgress {
  scannedFiles: number;
  matchedFiles: number;
  totalBytes: number;
  currentFolder: string;
  phase: "start" | "folder" | "scanning" | "done";
}

export interface IndexProgress {
  current: number;
  total: number;
  file: string;
}

export interface FolderStat {
  folder: string;
  fileCount: number;
}

export interface IndexResult {
  indexed: number;
  skipped: number;
  documentCount: number;
}

export type SyncStatus = "idle" | "syncing" | "done" | "error";

export interface Integration {
  id: string;
  name: string;
  connected: boolean;
  email: string | null;
  fileCount: number;
  lastSyncedAt: number | null;
}

export type IntegrationSyncStatus = "idle" | "syncing" | "done" | "error";

export interface IntegrationSyncState {
  status: IntegrationSyncStatus;
  indexed: number | null;
  error: string | null;
  current?: number;
  total?: number;
  fileName?: string;
}

export interface SyncState {
  status: SyncStatus;
  lastCompletedAt: number | null;
  lastDurationMs: number | null;
  lastIndexed: number | null;
  lastError?: string | null;
}

declare global {
  interface Window {
    incharjApi: {
      getState: () => Promise<AppState>;
      getFiles: () => Promise<IndexedFile[]>;
      search: (query: string, limit?: number) => Promise<SearchResult[]>;
      openFile: (filePath: string) => Promise<{ ok: boolean; error: string | null }>;
      revealFile: (filePath: string) => Promise<{ ok: boolean; error: string | null }>;
      startIndex: () => Promise<IndexResult>;
      resetIndex: () => Promise<{ ok: boolean }>;
      quit: () => Promise<{ ok: boolean }>;
      selectFolder: () => Promise<string | null>;
      addFolder: (folderPath: string) => Promise<AppState>;
      removeFolder: (folderPath: string) => Promise<AppState>;
      addExtension: (ext: string) => Promise<AppState>;
      removeExtension: (ext: string) => Promise<AppState>;
      getFolderStats: () => Promise<FolderStat[]>;
      scanIndexScope: () => Promise<IndexScopeEstimate>;
      completeOnboarding: () => Promise<AppState>;
      onScanProgress: (cb: (payload: ScanProgress) => void) => () => void;
      onIndexProgress: (cb: (p: IndexProgress) => void) => () => void;
      onBackgroundComplete: (cb: (payload: { documentCount: number }) => void) => () => void;
      onWatcherEvent: (cb: (event: { type: string; path: string; reason?: string }) => void) => () => void;
      watcherStatus: () => Promise<{ running: boolean }>;
      onSyncStart: (cb: (payload: { startedAt: number }) => void) => () => void;
      onSyncComplete: (cb: (payload: { documentCount: number; completedAt: number; durationMs: number; indexed: number; skipped: number }) => void) => () => void;
      onSyncError: (cb: (payload: { failedAt: number; message: string }) => void) => () => void;
      getIntegrations: () => Promise<Integration[]>;
      connectGoogleDrive: () => Promise<string>;
      syncGoogleDrive: () => Promise<{ indexed: number; skipped: number }>;
      connectNotion: () => Promise<string>;
      syncNotion: () => Promise<{ indexed: number; skipped: number }>;
      disconnectIntegration: (id: string) => Promise<void>;
      onIntegrationSyncStart: (cb: (payload: { id: string }) => void) => () => void;
      onIntegrationSyncProgress: (cb: (payload: { current: number; total: number; fileName: string }) => void) => () => void;
      onIntegrationSyncComplete: (cb: (payload: { id: string; indexed: number; skipped: number }) => void) => () => void;
      onIntegrationSyncError: (cb: (payload: { id: string; message: string }) => void) => () => void;
    };
  }
}
