import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, IndexProgress, IndexScopeEstimate, ScanProgress } from "../types";
import { shortenPath } from "../utils";

interface Props {
  appState: AppState | null;
  isIndexing: boolean;
  progress: IndexProgress | null;
  onAddFolder: () => void;
  onRemoveFolder: (folder: string) => void;
  onAddExtension: (ext: string) => void;
  onRemoveExtension: (ext: string) => void;
  onScanScope: () => Promise<IndexScopeEstimate>;
  onStartIndex: () => Promise<boolean>;
  onFinish: () => Promise<void>;
}

const ONBOARDING_EXTENSIONS = [".pdf", ".csv", ".docx", ".doc", ".xlsx", ".xls"];

type Step = "configure" | "estimate" | "indexing";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const size = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, size);
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[size]}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "under 1 minute";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (mins < 60) return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
  const hours = Math.floor(mins / 60);
  const leftoverMins = mins % 60;
  return leftoverMins === 0 ? `${hours}h` : `${hours}h ${leftoverMins}m`;
}

export default function OnboardingScreen({
  appState,
  isIndexing,
  progress,
  onAddFolder,
  onRemoveFolder,
  onAddExtension,
  onRemoveExtension,
  onScanScope,
  onStartIndex,
  onFinish,
}: Props) {
  const [step, setStep] = useState<Step>("configure");
  const [isScanning, setIsScanning] = useState(false);
  const [estimate, setEstimate] = useState<IndexScopeEstimate | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const estimatedConfigKey = useRef<string | null>(null);
  const [confirmRemoveFolder, setConfirmRemoveFolder] = useState<string | null>(null);

  useEffect(() => {
    const off = window.incharjApi.onScanProgress((payload) => {
      setScanProgress(payload);
    });
    return () => off();
  }, []);

  const folders = appState?.folders ?? [];
  const extensions = appState?.extensions ?? [];

  const configKey = [...folders].sort().join("|") + "§" + [...extensions].sort().join("|");

  useEffect(() => {
    if (estimatedConfigKey.current === null) return;
    if (step === "estimate" && configKey !== estimatedConfigKey.current) {
      setStep("configure");
    } else if (step === "configure" && estimate !== null && configKey === estimatedConfigKey.current) {
      setStep("estimate");
    }
  }, [configKey]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (folders.length === 0) out.push("Add at least one folder before continuing.");
    if (extensions.length === 0) out.push("Enable at least one extension before continuing.");
    if (folders.length >= 6) out.push("Many folders increase indexing time and background CPU usage.");
    if (estimate && estimate.fileCount > 15000) out.push("Large index scope detected. First run may take a while.");
    return out;
  }, [folders.length, extensions.length, estimate]);

  const redundantFolders = useMemo(() => {
    const pairs: { child: string; parent: string }[] = [];
    for (let i = 0; i < folders.length; i++) {
      for (let j = 0; j < folders.length; j++) {
        if (i === j) continue;
        const a = folders[i];
        const b = folders[j];
        const normalise = (p: string) => p.replace(/\/$/, "");
        const na = normalise(a);
        const nb = normalise(b);
        if (nb.startsWith(na + "/")) {
          pairs.push({ child: b, parent: a });
        }
      }
    }
    return pairs;
  }, [folders]);

  const canContinue = folders.length > 0 && extensions.length > 0;
  const isEstimateReady = step === "estimate" && Boolean(estimate);

  const handleEstimate = async () => {
    if (!canContinue) return;
    setScanProgress({
      scannedFiles: 0,
      matchedFiles: 0,
      totalBytes: 0,
      currentFolder: "",
      phase: "start",
    });
    setIsScanning(true);
    try {
      const next = await onScanScope();
      setEstimate(next);
      estimatedConfigKey.current = configKey;
      setStep("estimate");
    } catch {
      // scan errors surface via toast from parent
    } finally {
      setIsScanning(false);
    }
  };

  const handleStartIndex = async () => {
    setStep("indexing");
    const ok = await onStartIndex();
    if (!ok) {
      setStep("estimate");
      return;
    }
    await onFinish();
  };

  const locked = isScanning || isIndexing;

  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  const pct = total > 0 ? Math.floor((current / total) * 100) : 0;

  return (
    <div className="onboarding-shell">
      <div className="onboarding-panel">
        <header className="onboarding-header">
          <h1>Set up your search index</h1>
          <p>
            We will index files from the folders and extensions you choose. You can edit these settings now.
          </p>
        </header>

        <div key={step} className="onboarding-step-content">
        {step !== "indexing" && (
          <>
            <section className={`onboarding-section${locked ? " onboarding-section--locked" : ""}`}>
              <div className="onboarding-section-head">
                <h2>Folders to index</h2>
                <button className="btn-primary" onClick={onAddFolder} disabled={locked}>Add folder</button>
              </div>
              <div className="onboarding-list">
                {folders.length === 0 && <p className="onboarding-empty">No folders selected yet.</p>}
                {folders.map((folder) => (
                  <div key={folder} className="onboarding-row">
                    <span>{shortenPath(folder)}</span>
                    <button className="btn-secondary" onClick={() => setConfirmRemoveFolder(folder)} disabled={locked}>Remove</button>
                  </div>
                ))}
              </div>
            </section>

            <section className={`onboarding-section${locked ? " onboarding-section--locked" : ""}`}>
              <h2>Extensions to index</h2>
              <div className="ext-toggle-grid">
                {ONBOARDING_EXTENSIONS.map((ext) => {
                  const enabled = extensions.includes(ext);
                  const key = ext.replace(/^\./, "");
                  return (
                    <label
                      key={ext}
                      className={`ext-toggle${enabled ? " active" : ""}${locked ? " disabled" : ""}`}
                      data-ext={key}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={locked}
                        onChange={() => !locked && (enabled ? onRemoveExtension(ext) : onAddExtension(key))}
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
            </section>

            {redundantFolders.length > 0 && (
              <div className="onboarding-warning-box onboarding-warning-box--error">
                {redundantFolders.map(({ child, parent }) => (
                  <div key={child} className="onboarding-warning-row">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="onboarding-warning-icon" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M7 4v3.5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p>
                      <strong>{shortenPath(child)}</strong> is already inside <strong>{shortenPath(parent)}</strong> — files will be indexed twice.{" "}
                      <button className="onboarding-warning-action" onClick={() => setConfirmRemoveFolder(child)}>
                        Remove {shortenPath(child)}
                      </button>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="onboarding-warning-box">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            {(isScanning || (step === "estimate" && scanProgress)) && (
              <section className="onboarding-section">
                <h2>{isScanning ? "Scanning your files" : "Scan complete"}</h2>

                {isScanning && (
                  <div className="onboarding-scan-strip" role="status" aria-live="polite">
                    <div className="onboarding-scan-strip-head">
                      <span className="onboarding-live-dot" />
                      <strong>
                        {scanProgress?.currentFolder
                          ? `Looking in ${shortenPath(scanProgress.currentFolder)}`
                          : "Preparing search locations..."}
                      </strong>
                    </div>
                    <div className="onboarding-scan-strip-bar">
                      <div className="onboarding-scan-strip-bar-fill" />
                    </div>
                  </div>
                )}

                <div className="onboarding-live-grid">
                  <div className="onboarding-live-card">
                    <span className="onboarding-live-value">{(scanProgress?.scannedFiles ?? 0).toLocaleString()}</span>
                    <span className="onboarding-live-label">Files scanned</span>
                  </div>
                  <div className="onboarding-live-card">
                    <span className="onboarding-live-value">{(scanProgress?.matchedFiles ?? 0).toLocaleString()}</span>
                    <span className="onboarding-live-label">Matching files</span>
                  </div>
                  <div className="onboarding-live-card">
                    <span className="onboarding-live-value">{formatBytes(scanProgress?.totalBytes ?? 0)}</span>
                    <span className="onboarding-live-label">Data size</span>
                  </div>
                  <div className="onboarding-live-card">
                    <span className="onboarding-live-value">
                      {estimate ? formatDuration(estimate.estimatedSeconds) : "—"}
                    </span>
                    <span className="onboarding-live-label">Est. time</span>
                  </div>
                </div>
              </section>
            )}

            <div className="onboarding-actions">
              {step === "estimate" ? (
                <>
                  <button className="btn-secondary" onClick={() => setStep("configure")} disabled={isScanning || isIndexing}>
                    Back
                  </button>
                  <button className="btn-primary" onClick={handleStartIndex} disabled={isIndexing || isScanning || !canContinue}>
                    Start indexing
                  </button>
                </>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleEstimate}
                  disabled={isScanning || isIndexing || !canContinue}
                >
                  {isEstimateReady ? "Re-estimate scope" : "Estimate & continue"}
                </button>
              )}
            </div>
          </>
        )}

        {step === "indexing" && (
          <section className="onboarding-section">
            <h2>Indexing in progress</h2>
            <p className="onboarding-subtle">We will take you to search as soon as indexing is complete.</p>
            <div className="onboarding-progress-wrap">
              <div className="index-progress-bar onboarding-progress-bar">
                <div
                  className="index-progress-fill"
                  style={{ width: total > 0 ? `${pct}%` : "30%" }}
                />
              </div>
              <div className="onboarding-progress-meta">
                <span>
                  {total > 0
                    ? `${current.toLocaleString()} of ${total.toLocaleString()} files`
                    : `${current.toLocaleString()} files scanned...`}
                </span>
                {total > 0 && <strong>{pct}%</strong>}
              </div>
              {progress?.file && <p className="onboarding-current-file">{shortenPath(progress.file)}</p>}
            </div>
          </section>
        )}
        </div>
      </div>

      {confirmRemoveFolder && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmRemoveFolder(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M8 6h6M5 6h12l-1.5 13h-9L5 6zM9 10v5M13 10v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>Remove folder?</h3>
            <p>
              <strong>{shortenPath(confirmRemoveFolder)}</strong> will be removed from your index scope. Files already indexed from this folder won't be affected until you re-index.
            </p>
            <div className="confirm-modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmRemoveFolder(null)}>Cancel</button>
              <button
                className="btn-primary danger"
                onClick={() => {
                  onRemoveFolder(confirmRemoveFolder);
                  setConfirmRemoveFolder(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
