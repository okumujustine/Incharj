import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Unlisten = () => void;

async function makeListener<T>(event: string, callback: (payload: T) => void): Promise<Unlisten> {
  return listen<T>(event, (evt) => callback(evt.payload));
}

const api: Window["incharjApi"] = {
  getState: () => invoke("get_app_state") as Promise<any>,
  getFiles: () => invoke("get_indexed_files") as Promise<any>,
  search: (query: string, limit = 50) => invoke("search_query", { query, limit }) as Promise<any>,
  openFile: async (filePath: string) => {
    await invoke("open_file", { filePath });
    return { ok: true, error: null };
  },
  revealFile: async (filePath: string) => {
    await invoke("reveal_file", { filePath });
    return { ok: true, error: null };
  },
  startIndex: () => invoke("start_indexing") as Promise<any>,
  resetIndex: async () => {
    await invoke("reset_index");
    return { ok: true };
  },
  quit: async () => {
    await invoke("quit_app");
    return { ok: true };
  },
  selectFolder: () => invoke("select_folder") as Promise<string | null>,
  addFolder: (folderPath: string) => invoke("add_folder", { folderPath }) as Promise<any>,
  removeFolder: (folderPath: string) => invoke("remove_folder", { folderPath }) as Promise<any>,
  addExtension: (ext: string) => invoke("add_extension", { ext }) as Promise<any>,
  removeExtension: (ext: string) => invoke("remove_extension", { ext }) as Promise<any>,
  getFolderStats: () => invoke("get_folder_stats") as Promise<any>,
  scanIndexScope: () => invoke("scan_index_scope") as Promise<any>,
  completeOnboarding: () => invoke("complete_onboarding") as Promise<any>,
  onScanProgress: (cb: (payload: { scannedFiles: number; matchedFiles: number; totalBytes: number; currentFolder: string; phase: "start" | "folder" | "scanning" | "done" }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("scan:progress", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onIndexProgress: (cb: (p: any) => void) => {
    let off: Unlisten | null = null;
    void makeListener("index:progress", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onBackgroundComplete: (cb: (payload: { documentCount: number }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("index:background-complete", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onWatcherEvent: (cb: (event: { type: string; path: string; reason?: string }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("watcher:event", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  watcherStatus: () => invoke("watcher_status_command") as Promise<{ running: boolean }>,
  onSyncStart: (cb: (payload: { startedAt: number }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("sync:start", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onSyncComplete: (cb: (payload: { documentCount: number; completedAt: number; durationMs: number; indexed: number; skipped: number }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("sync:complete", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onSyncError: (cb: (payload: { failedAt: number; message: string }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("sync:error", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  getIntegrations: () => invoke("get_integrations") as Promise<any>,
  connectGoogleDrive: () => invoke("connect_google_drive") as Promise<string>,
  syncGoogleDrive: () => invoke("sync_google_drive") as Promise<any>,
  connectNotion: () => invoke("connect_notion") as Promise<string>,
  syncNotion: () => invoke("sync_notion") as Promise<any>,
  disconnectIntegration: (id: string) => invoke("disconnect_integration", { id }) as Promise<void>,
  resetIntegrationSync: (id: string) => invoke("reset_integration_sync", { id }) as Promise<void>,
  onIntegrationSyncStart: (cb: (payload: { id: string }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("integration:sync-start", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onIntegrationSyncProgress: (cb: (payload: { current: number; total: number; fileName: string }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("integration:sync-progress", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onIntegrationSyncComplete: (cb: (payload: { id: string; indexed: number; skipped: number }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("integration:sync-complete", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
  onIntegrationSyncError: (cb: (payload: { id: string; message: string }) => void) => {
    let off: Unlisten | null = null;
    void makeListener("integration:sync-error", cb).then((fn) => { off = fn; });
    return () => off?.();
  },
};

window.incharjApi = api;
