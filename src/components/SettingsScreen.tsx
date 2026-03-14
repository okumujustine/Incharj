import { useState } from "react";
import type { AppState, FolderStat, IndexProgress, IndexResult } from "../types";
import { shortenPath } from "../utils";

interface Props {
  appState: AppState | null;
  isIndexing: boolean;
  progress: IndexProgress | null;
  result: IndexResult | null;
  lastIndexedAt: number | null;
  folderStats: FolderStat[];
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
  onAddExtension: (ext: string) => void;
  onRemoveExtension: (ext: string) => void;
  onStart: () => void;
  onReset: () => void;
}

const SUGGESTED_EXTENSIONS = [".pdf", ".csv", ".docx", ".doc", ".xlsx", ".xls"];

function formatLastIndexed(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export default function SettingsScreen({
  appState,
  isIndexing,
  progress,
  result,
  lastIndexedAt,
  folderStats,
  onAddFolder,
  onRemoveFolder,
  onAddExtension,
  onRemoveExtension,
  onStart,
  onReset,
}: Props) {
  const folders = appState?.folders ?? [];
  const extensions = appState?.extensions ?? [];

  const accountedFiles = folderStats.reduce((sum, s) => sum + s.fileCount, 0);
  const staleFiles = (appState?.documentCount ?? 0) - accountedFiles;
  const hasStale = staleFiles > 0 && folderStats.length > 0;

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    type: "remove-folder" | "reset-index";
    folder?: string;
  } | null>(null);

  const handleConfirm = () => {
    if (!confirmModal) return;
    if (confirmModal.type === "remove-folder" && confirmModal.folder) {
      onRemoveFolder(confirmModal.folder);
    } else if (confirmModal.type === "reset-index") {
      onReset();
    }
    setConfirmModal(null);
  };

  return (
    <div className="screen-scroll">
      <div className="screen-stack">

        {/* Folders */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2>Folders</h2>
              <p>Add, remove, and control which folders are indexed.</p>
            </div>
            <button className="btn-primary" onClick={onAddFolder}>Add folder</button>
          </div>
          <div className="management-list">
            {folders.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--c-text-muted)", padding: "12px 0" }}>No folders added yet.</p>
            )}
            {folders.map((folder) => {
              const stat = folderStats.find((s) => s.folder === folder);
              const fileCount = stat?.fileCount ?? null;
              return (
                <div key={folder} className="management-row">
                  <div>
                    <strong>{shortenPath(folder)}</strong>
                    <p>
                      {fileCount !== null
                        ? `${fileCount.toLocaleString()} ${fileCount === 1 ? "file" : "files"} indexed`
                        : lastIndexedAt
                        ? `Last indexed ${formatLastIndexed(lastIndexedAt)}`
                        : "Not yet indexed"}
                    </p>
                  </div>
                  <div className="management-actions">
                    {fileCount !== null && (
                      <span className="folder-file-count">{fileCount.toLocaleString()}</span>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={() => setConfirmModal({ type: "remove-folder", folder })}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Extensions */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2>Extensions</h2>
              <p>File types to include when indexing.</p>
            </div>
          </div>
          <div className="ext-toggle-grid">
            {SUGGESTED_EXTENSIONS.map((ext) => {
              const enabled = extensions.includes(ext);
              const key = ext.replace(/^\./, "");
              return (
                <label
                  key={ext}
                  className={enabled ? "ext-toggle active" : "ext-toggle"}
                  data-ext={key}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => (enabled ? onRemoveExtension(ext) : onAddExtension(key))}
                  />
                  <span className="ext-toggle-name">{ext}</span>
                  <span className="ext-toggle-check">
                    <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Index Controls */}
        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2>Index</h2>
              <p>Monitor and manage your document index.</p>
            </div>
          </div>

          <div className="index-stats">
            <div className="index-stat">
              <span className="index-stat-value">{appState?.documentCount?.toLocaleString() ?? 0}</span>
              <span className="index-stat-label">Files indexed</span>
            </div>
            <div className="index-stat">
              <span className="index-stat-value">{folders.length}</span>
              <span className="index-stat-label">Folders</span>
            </div>
            <div className="index-stat">
              <span className="index-stat-value">{extensions.length}</span>
              <span className="index-stat-label">Extensions</span>
            </div>
          </div>

          {hasStale && (
            <div className="stale-warning">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M7 1L13 12H1L7 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M7 5.5v3M7 10v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>
                <strong>{staleFiles.toLocaleString()} files</strong> in the index are from folders no longer in your config. Re-index to clean them up.
              </span>
              <button className="btn-secondary stale-warning-action" onClick={onStart} disabled={isIndexing}>
                Re-index now
              </button>
            </div>
          )}

          <div className="index-actions">
            <button
              onClick={onStart}
              disabled={isIndexing || folders.length === 0 || extensions.length === 0}
              className="btn-primary"
            >
              {isIndexing ? (
                <>
                  <svg className="animate-spin-slow" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="17 9" opacity="0.4" />
                    <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Indexing…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7a4.5 4.5 0 1 0 4.5-4.5M7 2.5v-2M5 0.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Re-index all
                </>
              )}
            </button>
            <button
              className="btn-secondary danger"
              onClick={() => setConfirmModal({ type: "reset-index" })}
              disabled={isIndexing}
            >
              Clear index
            </button>
          </div>

          {isIndexing && progress && (
            <div className="index-progress">
              <div className="index-progress-bar">
                <div
                  className="index-progress-fill"
                  style={{ width: progress.total > 0 ? `${Math.floor((progress.current / progress.total) * 100)}%` : "33%" }}
                />
              </div>
              <span className="index-progress-text">
                {progress.total > 0
                  ? `${progress.current.toLocaleString()} of ${progress.total.toLocaleString()} files`
                  : `${progress.current.toLocaleString()} files scanned…`}
              </span>
            </div>
          )}

          {!isIndexing && result && (
            <div className="index-result-neutral">
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                Last run: <strong>{result.indexed.toLocaleString()} new</strong>
                {result.skipped > 0 && <span className="text-muted"> · {result.skipped.toLocaleString()} already up to date</span>}
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3>
              {confirmModal.type === "remove-folder" 
                ? "Remove folder?" 
                : "Reset index?"}
            </h3>
            <p>
              {confirmModal.type === "remove-folder"
                ? `This will stop indexing "${shortenPath(confirmModal.folder ?? "")}". Files won't be deleted.`
                : "This will clear all indexed documents. You'll need to re-index your folders."}
            </p>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmModal(null)}>
                Cancel
              </button>
              <button className="btn-primary danger" onClick={handleConfirm}>
                {confirmModal.type === "remove-folder" ? "Remove" : "Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
