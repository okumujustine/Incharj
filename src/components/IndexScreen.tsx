import { useState, useEffect } from "react";
import type { AppState, IndexProgress, IndexResult } from "../types";
import { shortenPath } from "../utils";

interface Props {
  appState: AppState | null;
  isIndexing: boolean;
  progress: IndexProgress | null;
  result: IndexResult | null;
  lastIndexedAt: number | null;
  onStart: () => void;
  onReset: () => void;
  onAddFolder: () => void;
  onRemoveFolder: (folderPath: string) => void;
  onAddExtension: (ext: string) => void;
  onRemoveExtension: (ext: string) => void;
}

function formatLastIndexed(ts: number | null): string {
  if (!ts) return "Never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "Just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Layout primitives ──────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div 
      className="glass-card overflow-hidden"
      style={{
        boxShadow: "var(--shadow-inner), var(--shadow-md)"
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({
  title, description, action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div 
      className="flex items-center justify-between gap-4 px-5 py-5 border-b"
      style={{ borderColor: "var(--c-border-subtle)" }}
    >
      <div className="min-w-0">
        <h3 
          className="text-[13px] font-semibold leading-snug"
          style={{ color: "var(--c-text-primary)" }}
        >
          {title}
        </h3>
        {description && (
          <p 
            className="text-[13px] mt-1 leading-snug"
            style={{ color: "var(--c-text-tertiary)" }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="btn-primary"
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  );
}

// ── Folder row ─────────────────────────────────────────────────

function FolderRow({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const display = path.replace(/^\/Users\/[^/]+/, "~");

  const handleClick = () => {
    if (confirming) { onRemove(); }
    else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <div className="group flex items-center gap-3 py-3">
      <div 
        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
        style={{ 
          background: "var(--c-accent-dim)",
          border: "1px solid var(--c-border-accent)"
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--c-accent-text)" }}>
          <path d="M1.5 4.5h11M1.5 4.5A1 1 0 0 1 2.5 3.5h3l1.5 1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-6.5z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </div>
      <span 
        className="flex-1 text-[12.5px] font-mono truncate"
        style={{ color: "var(--c-text-secondary)" }}
      >
        {display}
      </span>
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200"
        style={confirming ? {
          background: "var(--c-danger-dim)",
          color: "var(--c-danger)",
          border: "1px solid rgba(239, 68, 68, 0.25)"
        } : {
          opacity: 0,
          color: "var(--c-text-muted)",
          background: "transparent",
          border: "1px solid transparent"
        }}
      >
        {confirming ? (
          "Confirm remove"
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <style>{`.group:hover button { opacity: 1 !important; }`}</style>
    </div>
  );
}

// ── Predefined extension list ──────────────────────────────────

const PRESET_EXTENSIONS = [
  { ext: ".pdf",  label: "PDF" },
  { ext: ".doc",  label: "Word Document" },
  { ext: ".docx", label: "Word Document (modern)" },
  { ext: ".xls",  label: "Excel Spreadsheet" },
  { ext: ".xlsx", label: "Excel Spreadsheet (modern)" },
  { ext: ".csv",  label: "CSV Spreadsheet" },
  { ext: ".md",   label: "Markdown" },
];

// ── Clear index button with confirmation ───────────────────────

function ClearButton({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);

  const handleClick = () => {
    if (confirm) { setConfirm(false); onReset(); }
    else { setConfirm(true); setTimeout(() => setConfirm(false), 4000); }
  };

  return (
    <button
      onClick={handleClick}
      className={confirm ? "btn-secondary danger" : "btn-secondary"}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M2 6.5a4.5 4.5 0 1 1 4.5 4.5H2M2 6.5l2.5-2.5M2 6.5l2.5 2.5"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {confirm ? "Confirm clear?" : "Clear index"}
    </button>
  );
}

// ── Main settings screen ───────────────────────────────────────

export default function IndexScreen({
  appState, isIndexing, progress, result, lastIndexedAt,
  onStart, onReset, onAddFolder, onRemoveFolder,
  onAddExtension, onRemoveExtension,
}: Props) {
  const isIndeterminate = !progress || progress.total === 0;
  const pct = !isIndeterminate
    ? Math.floor((progress!.current / progress!.total) * 100) : 0;

  const folders = appState?.folders ?? [];
  const extensions = appState?.extensions ?? [];
  const docCount = appState?.documentCount ?? 0;

  // Optimistic local state so checkboxes respond instantly
  const [activeExts, setActiveExts] = useState<string[]>(extensions);
  useEffect(() => { setActiveExts(extensions); }, [extensions]);

  const toggleExt = (ext: string) => {
    const enabled = activeExts.includes(ext);
    setActiveExts((prev) => enabled ? prev.filter((e) => e !== ext) : [...prev, ext]);
    if (enabled) onRemoveExtension(ext);
    else onAddExtension(ext.slice(1));
  };

  const canIndex = activeExts.length > 0 && folders.length > 0;

  return (
    <div className="screen-scroll">
      <div className="screen-content">

        {/* Page title */}
        <div className="screen-title">
          <h1>Index Settings</h1>
          <p>Configure which folders and file types are indexed for search.</p>
        </div>

        <div className="screen-sections">

        {/* ── Section 1: Indexed Folders ── */}
        <Section>
          <SectionHeader
            title="Indexed Folders"
            description="Folders scanned and indexed for full-text search."
            action={<AddButton onClick={onAddFolder} label="Add Folder" />}
          />
          <div className="px-5 py-5">
            {folders.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ color: "var(--c-text-muted)", opacity: 0.4 }}>
                  <path d="M3 9h30M3 9A2.5 2.5 0 0 1 5.5 6.5h9l2.5 2.5h14A2.5 2.5 0 0 1 33.5 11.5v17a2.5 2.5 0 0 1-2.5 2.5H5a2.5 2.5 0 0 1-2.5-2.5V9z"
                    stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <p 
                  className="text-[13px]"
                  style={{ color: "var(--c-text-muted)" }}
                >
                  No folders added yet
                </p>
                <button
                  onClick={onAddFolder}
                  className="text-[13px] font-medium transition-colors mt-1"
                  style={{ color: "var(--c-accent-text)" }}
                >
                  Add your first folder →
                </button>
              </div>
            ) : (
              <div 
                className="divide-y"
                style={{ borderColor: "var(--c-border-subtle)" }}
              >
                {folders.map((f) => (
                  <FolderRow key={f} path={f} onRemove={() => onRemoveFolder(f)} />
                ))}
              </div>
            )}
          </div>
        </Section>

        {/* ── Section 2: File Extensions ── */}
        <Section>
          <SectionHeader
            title="Supported File Types"
            description="Only files with these extensions will be indexed."
          />
          <div className="px-5 py-5 space-y-4">
            {/* Checkbox grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {PRESET_EXTENSIONS.map(({ ext, label }) => {
                const checked = activeExts.includes(ext);
                return (
                  <label
                    key={ext}
                    className="flex items-center gap-3 py-2.5 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExt(ext)}
                      className="checkbox-custom"
                    />
                    <span className="flex items-center gap-2 min-w-0">
                      <span 
                        className="text-[13px] font-mono font-medium"
                        style={{ color: "var(--c-tx-sec)" }}
                      >{ext}</span>
                      <span 
                        className="text-[11px] truncate"
                        style={{ color: "var(--c-tx-muted)" }}
                      >{label}</span>
                    </span>
                  </label>
                );
              })}
            </div>

          </div>
        </Section>

        {/* ── Section 3: Index Controls ── */}
        <Section>
          <SectionHeader
            title="Index Controls"
            description="Monitor and manage the document index."
          />
          <div className="px-5 py-5 space-y-5">

            {/* Status counters */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: docCount.toLocaleString(), label: "Files indexed" },
                { value: String(folders.length),    label: "Folders" },
                { value: formatLastIndexed(lastIndexedAt), label: "Last indexed" },
              ].map(({ value, label }) => (
                <div 
                  key={label} 
                  className="flex flex-col gap-2 p-4 rounded-xl border"
                  style={{
                    backgroundColor: "var(--c-glass)",
                    borderColor: "var(--c-border-subtle)",
                  }}
                >
                  <span 
                    className="text-lg font-bold tabular-nums leading-none"
                    style={{ color: "var(--c-text-primary)" }}
                  >{value}</span>
                  <span 
                    className="text-xs uppercase tracking-wider font-medium"
                    style={{ color: "var(--c-text-muted)" }}
                  >{label}</span>
                </div>
              ))}
            </div>

            {/* Warning — shown above buttons only when nothing is configured */}
            {!canIndex && !isIndexing && (
              <p 
                className="text-[13px] px-3 py-2 rounded-lg"
                style={{ 
                  backgroundColor: "var(--c-warning-dim)",
                  color: "var(--c-warning)",
                  border: "1px solid rgba(83, 125, 150, 0.18)"
                }}
              >
                {folders.length === 0
                  ? "Add at least one folder and select file types before indexing."
                  : "Select at least one file type before indexing."}
              </p>
            )}

            {/* Action buttons — always visible, never pushed by progress */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={onStart}
                disabled={isIndexing || !canIndex}
                className="btn-primary"
              >
                {isIndexing ? (
                  <>
                    <svg className="animate-spin-slow" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"
                        strokeDasharray="17 9" opacity="0.4" />
                      <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Indexing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7a4.5 4.5 0 1 0 4.5-4.5M7 2.5v-2M5 0.5h4"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Re-index all
                  </>
                )}
              </button>
              <ClearButton onReset={onReset} />
            </div>

            {/* Progress bar — below buttons so they never move */}
            {isIndexing && (
              <div className="space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between text-[13px]">
                  <span style={{ color: "var(--c-text-secondary)" }}>
                    {progress
                      ? isIndeterminate
                        ? `${progress.current.toLocaleString()} files scanned…`
                        : `${progress.current.toLocaleString()} of ${progress.total.toLocaleString()} files`
                      : "Scanning folders…"}
                  </span>
                  {!isIndeterminate && (
                    <span 
                      className="tabular-nums font-medium"
                      style={{ color: "var(--c-accent-text)" }}
                    >{pct}%</span>
                  )}
                </div>
                <div 
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: "rgba(118, 127, 148, 0.14)" }}
                >
                  {isIndeterminate ? (
                    <div
                      className="h-full w-1/3 rounded-full animate-[slide_1.2s_ease-in-out_infinite]"
                      style={{ backgroundColor: "var(--c-accent-solid)" }}
                    />
                  ) : (
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: "var(--c-accent-solid)",
                      }}
                    />
                  )}
                </div>
                {progress?.file && (
                  <p 
                    className="text-[11px] font-mono truncate"
                    style={{ color: "var(--c-text-muted)" }}
                  >
                    {shortenPath(progress.file)}
                  </p>
                )}
              </div>
            )}

            {/* Last run result — below buttons */}
            {!isIndexing && result && (
              <div 
                className="flex items-center gap-3 px-4 py-3 rounded-xl border animate-fade-in"
                style={{
                  backgroundColor: "var(--c-success-dim)",
                  borderColor: "rgba(68, 161, 148, 0.24)",
                }}
              >
                <div 
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "rgba(68, 161, 148, 0.18)" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="var(--c-success)" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[13px]" style={{ color: "var(--c-text-secondary)" }}>
                  <span 
                    className="font-semibold"
                    style={{ color: "var(--c-text-primary)" }}
                  >{result.indexed.toLocaleString()}</span> new files indexed
                  {result.skipped > 0 && (
                    <span style={{ color: "var(--c-text-muted)" }}> · {result.skipped.toLocaleString()} skipped</span>
                  )}
                </p>
              </div>
            )}

          </div>
        </Section>

        </div>{/* screen-sections */}
      </div>
    </div>
  );
}
