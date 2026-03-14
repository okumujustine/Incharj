import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { AppState, Screen, SyncState } from "../types";
import SearchBar from "./SearchBar";

interface Props {
  appState: AppState | null;
  screen: Screen;
  syncState: SyncState;
  query: string;
  isSearching: boolean;
  searchStatus: string;
  onScreenChange: (s: Screen) => void;
  onQueryChange: (q: string) => void;
}

const TABS: { key: Screen; label: string; icon: React.ReactNode }[] = [
  {
    key: "search",
    label: "Search",
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "files",
    label: "Files",
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M1.5 3h10M1.5 6.5h10M1.5 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "Settings",
    icon: (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path d="M6.5 1.7l1 1.15 1.5-.15.7 1.35 1.45.45v1.55l-1.45.45-.7 1.35-1.5-.15-1 1.15-1-.15-1-1-1.5.15-.7-1.35-1.45-.45V4.5l1.45-.45.7-1.35 1.5.15 1-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="6.5" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    ),
  },
];

/** Converts an epoch ms timestamp to a human-readable relative string. */
function useRelativeTime(epochMs: number | null): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!epochMs) { setLabel(""); return; }

    function compute() {
      const diffS = Math.floor((Date.now() - epochMs!) / 1000);
      if (diffS < 10)  return "just now";
      if (diffS < 60)  return `${diffS}s ago`;
      const diffM = Math.floor(diffS / 60);
      if (diffM < 60)  return `${diffM}m ago`;
      const diffH = Math.floor(diffM / 60);
      if (diffH < 24)  return `${diffH}h ago`;
      return `${Math.floor(diffH / 24)}d ago`;
    }

    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), 15_000);
    return () => clearInterval(id);
  }, [epochMs]);

  return label;
}

function SyncIndicator({ syncState }: { syncState: SyncState }) {
  const relativeTime = useRelativeTime(syncState.lastCompletedAt);

  if (syncState.status === "syncing") {
    return (
      <span className="topbar-sync-indicator topbar-sync-active">
        <svg
          width="11" height="11" viewBox="0 0 10 10" fill="none"
          className="animate-spin"
          style={{ animationDuration: "0.8s" }}
        >
          <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeDasharray="14" strokeDashoffset="6" opacity="0.3" />
          <path d="M5 1.5A3.5 3.5 0 0 1 8.5 5" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Syncing…
      </span>
    );
  }

  if (syncState.status === "done") {
    const newFiles = syncState.lastIndexed ?? 0;
    return (
      <span className="topbar-sync-indicator topbar-sync-done">
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {newFiles > 0 ? `+${newFiles} file${newFiles !== 1 ? "s" : ""} synced` : "Up to date"}
      </span>
    );
  }

  if (syncState.status === "error") {
    return (
      <span className="topbar-sync-indicator" title={syncState.lastError ?? undefined}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="3.2" fill="currentColor" opacity="0.7" />
        </svg>
        Sync paused
      </span>
    );
  }

  if (relativeTime) {
    return (
      <span className="topbar-sync-indicator">
        <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
          <circle cx="4" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Synced {relativeTime}
      </span>
    );
  }

  return null;
}

export default function TopBar({
  appState,
  screen,
  syncState,
  query,
  isSearching,
  searchStatus,
  onScreenChange,
  onQueryChange,
}: Props) {
  const docCount = appState?.documentCount ?? 0;
  const statsLine = `${docCount.toLocaleString()} indexed`;

  const handleHeaderMouseDown = async (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".no-drag")) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    try {
      await getCurrentWebviewWindow().startDragging();
    } catch {}
  };

  return (
    <header
      data-tauri-drag-region
      className="drag-region app-header app-topbar"
      onMouseDown={(event) => {
        void handleHeaderMouseDown(event);
      }}
    >
      <div data-tauri-drag-region className="window-drag-strip" aria-hidden="true" />
      <div className="no-drag topbar-brand">
        <div className="brand-mark">I</div>
        <div className="brand-copy">
          <div className="brand-title">Incharj</div>
          <div className="brand-meta">{statsLine}</div>
        </div>
      </div>

      <div className="no-drag topbar-search">
        <SearchBar
          query={query}
          onChange={onQueryChange}
          isSearching={isSearching}
          status={searchStatus}
          large={false}
        />
      </div>

      <div className="no-drag topbar-actions">
        <div className="topbar-nav">
          {TABS.map((tab) => {
            const active = screen === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onScreenChange(tab.key)}
                className={active ? "topbar-nav-btn active" : "topbar-nav-btn"}
                title={tab.label}
              >
                {tab.icon}
              </button>
            );
          })}
        </div>
        <div className="topbar-sync">
          <SyncIndicator syncState={syncState} />
        </div>
      </div>
    </header>
  );
}
