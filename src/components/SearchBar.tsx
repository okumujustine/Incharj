import { useRef, useEffect } from "react";

interface Props {
  query: string;
  onChange: (q: string) => void;
  isSearching: boolean;
  status: string;
  large?: boolean;
}

export default function SearchBar({ query, onChange, isSearching, status, large = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Split "50 results · 131ms" into parts for richer rendering
  const statusParts = status.match(/^(\d+)\s+result[s]?\s*·\s*(\d+ms)$/);

  return (
    <div className={large ? "searchbar-stack searchbar-stack-large" : "searchbar-stack searchbar-stack-compact"}>
      <div className={large ? "search-input-wrapper search-input-elevated search-input-shell search-input-shell-large" : "search-input-wrapper search-input-shell search-input-shell-compact"}>
        <span
          className={isSearching ? "search-icon search-icon-active" : "search-icon"}
        >
          {isSearching ? (
            <svg className="animate-spin-slow" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="25 15" opacity="0.3" />
              <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13 13L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search notes, docs, or code..."
          className="search-input"
          spellCheck={false}
          autoComplete="off"
        />

        {query ? (
          <button
            onClick={() => onChange("")}
            className="btn-ghost shrink-0 w-8 h-8 rounded-lg"
            aria-label="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <div className="search-shortcut-wrap shrink-0 hidden sm:flex items-center gap-2">
            <kbd className="search-shortcut">
              ⌘K
            </kbd>
          </div>
        )}
      </div>

      {large ? (
        <div className="search-status-row">
          {statusParts ? (
            <div className="search-status-main">
              <span className="search-status-count">
                {statusParts[1]}
              </span>
              <span className="search-status-label">matches</span>
              <span className="search-status-separator">·</span>
              <span className="search-status-time">
                {statusParts[2]}
              </span>
            </div>
          ) : (
            <span className="search-status-label">{status}</span>
          )}
          <div className="search-status-hints">
            <kbd className="search-hint-kbd">↑↓</kbd>
            <span>move</span>
            <span className="search-status-separator">·</span>
            <kbd className="search-hint-kbd">↵</kbd>
            <span>open</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
