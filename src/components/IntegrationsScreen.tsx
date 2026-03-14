import { useState } from "react";
import type { Integration, IntegrationSyncState } from "../types";

interface Props {
  integrations: Integration[];
  syncStates: Record<string, IntegrationSyncState>;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (id: string) => Promise<void>;
  onSync: (id: string) => Promise<void>;
}

function formatLastSynced(ts: number | null): string {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Icons ──────────────────────────────────────────────────────────────────
function GoogleDriveIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" fill="none">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.96 8l4.64 5.85z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2a15.5 15.5 0 00-3.3 3.3L1.96 48.4A15.92 15.92 0 000 56.4h27.5L43.65 25z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.96-8H59.8l5.85 12.35 7.9 14.95z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2A15.52 15.52 0 0046.1.05a15.7 15.7 0 00-8.1 2.25L16.35 25h27.3z" fill="#00832D"/>
      <path d="M59.8 56.4h27.5L59.95 8.5a15.72 15.72 0 00-5.75-5.75L40.45 25 59.8 56.4z" fill="#2684FC"/>
      <path d="M27.5 56.4H59.8L43.65 25 27.5 56.4z" fill="#FFBA00"/>
    </svg>
  );
}

function NotionIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect width="100" height="100" rx="18" fill="#191919"/>
      <path d="M27 23.5c2.8 2.3 3.9 2.1 9.2 1.8L74 23c1 0 1.8-.9 1.8-1.8 0-1-.8-1.8-1.8-1.8l-38.2 2.2C31.2 21.9 29 21.2 27 18.8v64.5c0 2.4 1.5 3.2 3.6 2.6L76 74.2c1.3-.4 2.1-1.6 2.1-3V38c0-1.8-1.1-3.4-2.7-4l-8.9-3.3c-1.8-.7-3.8.5-3.8 2.5v32.6c0 1.3-.9 1.8-2.5 1.8H32.8c-1.8 0-3-.8-3-3V23.5z" fill="white"/>
    </svg>
  );
}

function PlaceholderIcon({ label }: { label: string }) {
  return (
    <div className="int-tile-icon-placeholder">{label[0]}</div>
  );
}

// ── Integration tile ───────────────────────────────────────────────────────
function IntegrationTile({
  integration,
  syncState,
  onConnect,
  onDisconnect,
  onSync,
}: {
  integration: Integration;
  syncState: IntegrationSyncState;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const isSyncing = syncState.status === "syncing";

  return (
    <div className={`int-tile ${integration.connected ? "int-tile--connected" : ""}`}>

      {/* Header row */}
      <div className="int-tile-header">
        <div className="int-tile-icon">
          {integration.id === "google_drive" && <GoogleDriveIcon size={22} />}
          {integration.id === "notion" && <NotionIcon size={22} />}
        </div>
        <div className="int-tile-name-group">
          <span className="int-tile-name">{integration.name}</span>
          {integration.connected && integration.email && (
            <span className="int-tile-account">{integration.email}</span>
          )}
        </div>
        <span className={`int-tile-status ${integration.connected ? "int-tile-status--on" : "int-tile-status--off"}`}>
          {integration.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {/* Stats row */}
      {integration.connected && (
        <div className="int-tile-stats">
          <span className="int-tile-stat">
            <strong>{integration.fileCount.toLocaleString()}</strong> indexed
          </span>
          <span className="int-tile-stat-sep">·</span>
          <span className="int-tile-stat">
            {formatLastSynced(integration.lastSyncedAt)}
          </span>
        </div>
      )}

      {/* Sync progress */}
      {isSyncing && (() => {
        const current = syncState.current ?? 0;
        const total = syncState.total ?? 0;
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const fileName = syncState.fileName ?? "";
        return (
          <div className="int-tile-progress">
            <div className="int-tile-progress-track">
              <div
                className="int-tile-progress-fill"
                style={total > 0 ? { width: `${pct}%`, transition: "width 0.3s ease" } : undefined}
              />
            </div>
            <span className="int-tile-progress-label">
              {total > 0 ? `${current} / ${total}${fileName ? ` · ${fileName}` : ""}` : "Starting…"}
            </span>
          </div>
        );
      })()}

      {/* Sync result / error */}
      {syncState.status === "done" && syncState.indexed !== null && (
        <div className="int-tile-result">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {syncState.indexed} new files indexed
        </div>
      )}
      {syncState.status === "error" && syncState.error && (
        <div className="int-tile-error">{syncState.error}</div>
      )}

      {/* Actions */}
      <div className="int-tile-actions">
        {integration.connected ? (
          confirmDisconnect ? (
            <div className="int-tile-confirm">
              <span>Remove and delete all synced files?</span>
              <button className="btn-primary danger" onClick={onDisconnect}>Yes</button>
              <button className="btn-secondary" onClick={() => setConfirmDisconnect(false)}>Cancel</button>
            </div>
          ) : (
            <>
              <button className="btn-primary" onClick={onSync} disabled={isSyncing}>
                {isSyncing
                  ? <><svg className="animate-spin-slow" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="17 9" opacity="0.4"/><path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> Syncing…</>
                  : "Sync now"
                }
              </button>
              <button className="btn-secondary" onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
            </>
          )
        ) : (
          <button className="btn-primary" onClick={() => onConnect()}>Connect</button>
        )}
      </div>
    </div>
  );
}

// ── Coming soon tile ───────────────────────────────────────────────────────
function SoonTile({ name }: { name: string }) {
  return (
    <div className="int-tile int-tile--soon">
      <div className="int-tile-header">
        <div className="int-tile-icon">
          <PlaceholderIcon label={name} />
        </div>
        <div className="int-tile-name-group">
          <span className="int-tile-name">{name}</span>
        </div>
        <span className="int-tile-status int-tile-status--soon">Soon</span>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
const COMING_SOON = ["Dropbox", "OneDrive", "Confluence", "SharePoint", "Box", "Slack"];

export default function IntegrationsScreen({ integrations, syncStates, onConnect, onDisconnect, onSync }: Props) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async (id: string) => {
    setConnecting(id);
    setConnectError(null);
    try {
      await onConnect(id);
    } catch (err) {
      setConnectError(String(err));
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="screen-scroll">
      <div className="screen-stack">

        <div className="settings-section">
          <div className="settings-section-header">
            <div>
              <h2>Integrations</h2>
              <p>Connect cloud services to search their files alongside your local documents.</p>
            </div>
          </div>

          <div className="integrations-grid">
            {integrations.map((integration) => (
              <IntegrationTile
                key={integration.id}
                integration={integration}
                syncState={syncStates[integration.id] ?? { status: "idle", indexed: null, error: null }}
                onConnect={() => handleConnect(integration.id)}
                onDisconnect={() => onDisconnect(integration.id)}
                onSync={() => onSync(integration.id)}
              />
            ))}
            {COMING_SOON.map((name) => (
              <SoonTile key={name} name={name} />
            ))}
          </div>
        </div>

      </div>

      {/* OAuth waiting overlay */}
      {(connecting === "google_drive" || connecting === "notion") && (
        <div className="integration-connecting-overlay">
          <div className="integration-connecting-box">
            <svg className="animate-spin-slow" width="20" height="20" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="17 9" opacity="0.4"/>
              <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>Waiting for authorization in browser…</span>
          </div>
        </div>
      )}

      {connectError && (
        <div className="integration-connecting-overlay" onClick={() => setConnectError(null)}>
          <div className="integration-connecting-box integration-connecting-box--error">
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>{connectError}</span>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setConnectError(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
