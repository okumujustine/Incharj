import { useState } from "react";
import type { IndexedFile } from "../types";
import { splitPath, formatAge, getExtLabel, getFileTone, shortenPath } from "../utils";

const PAGE_SIZE = 20;

interface Props {
  files: IndexedFile[];
  isLoading: boolean;
  folders: string[];
  onOpen: (path: string) => void;
}

function expandHome(p: string) {
  return p.startsWith("~/") ? p.replace("~", "/Users/" + ((window as any).__username__ ?? "")) : p;
}

function fileInFolder(filePath: string, folder: string) {
  const expanded = folder.startsWith("~")
    ? filePath.toLowerCase().includes(folder.slice(2).toLowerCase())
    : filePath.toLowerCase().startsWith(folder.toLowerCase());
  return expanded;
}

const DRIVE_FILTER = "__gdrive__";

export default function FilesScreen({ files, isLoading, folders, onOpen }: Props) {
  const [filter, setFilter] = useState("");
  const [activeFolders, setActiveFolders] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const hasDriveFiles = files.some((f) => f.source === "google_drive");

  const folderFiltered = activeFolders.length > 0
    ? files.filter((f) => {
        if (activeFolders.includes(DRIVE_FILTER)) {
          if (f.source === "google_drive") return true;
          // also match other active folder filters
          const otherFolders = activeFolders.filter((v) => v !== DRIVE_FILTER);
          return otherFolders.length > 0 && otherFolders.some((folder) => fileInFolder(f.path, folder));
        }
        return activeFolders.some((folder) => fileInFolder(f.path, folder));
      })
    : files;

  const toggleFolder = (folder: string) => {
    setActiveFolders((prev) =>
      prev.includes(folder) ? prev.filter((f) => f !== folder) : [...prev, folder]
    );
    setVisibleCount(PAGE_SIZE);
  };

  const filtered = filter
    ? folderFiltered.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))
    : folderFiltered;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div className="files-screen">
      <div className="files-toolbar-group">
        <div className="files-toolbar">
          <div className="filter-input-shell">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="filter-input-icon shrink-0">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
              <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={filter}
              onChange={(e) => { setFilter(e.target.value); setVisibleCount(PAGE_SIZE); }}
              placeholder="Filter indexed files…"
              className="filter-input-field"
            />
            {filter && (
              <button onClick={() => setFilter("")} className="filter-input-clear">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <span className="files-toolbar-count shrink-0 tabular-nums">
            <span className="files-toolbar-count-value">{filtered.length.toLocaleString()}</span>
            {" "}{filtered.length === 1 ? "file" : "files"}
          </span>
        </div>
        {(folders.length > 0 || hasDriveFiles) && (
          <div className="folder-filter-bar">
            <button
              className={activeFolders.length === 0 ? "folder-pill active" : "folder-pill"}
              onClick={() => { setActiveFolders([]); setVisibleCount(PAGE_SIZE); }}
            >
              All
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                className={activeFolders.includes(folder) ? "folder-pill active" : "folder-pill"}
                onClick={() => toggleFolder(folder)}
                title={folder}
              >
                {shortenPath(folder)}
              </button>
            ))}
            {hasDriveFiles && (
              <button
                className={activeFolders.includes(DRIVE_FILTER) ? "folder-pill folder-pill--drive active" : "folder-pill folder-pill--drive"}
                onClick={() => toggleFolder(DRIVE_FILTER)}
                title="Google Drive"
              >
                <svg width="10" height="10" viewBox="0 0 87.3 78" fill="none" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}>
                  <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.96 8l4.64 5.85z" fill="#0066DA"/>
                  <path d="M43.65 25L29.9 1.2a15.5 15.5 0 00-3.3 3.3L1.96 48.4A15.92 15.92 0 000 56.4h27.5L43.65 25z" fill="#00AC47"/>
                  <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.96-8H59.8l5.85 12.35 7.9 14.95z" fill="#EA4335"/>
                  <path d="M43.65 25L57.4 1.2A15.52 15.52 0 0046.1.05a15.7 15.7 0 00-8.1 2.25L16.35 25h27.3z" fill="#00832D"/>
                  <path d="M59.8 56.4h27.5L59.95 8.5a15.72 15.72 0 00-5.75-5.75L40.45 25 59.8 56.4z" fill="#2684FC"/>
                  <path d="M27.5 56.4H59.8L43.65 25 27.5 56.4z" fill="#FFBA00"/>
                </svg>
                Google Drive
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="files-list">
        {isLoading ? (
          <div className="files-empty-state">
            <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="17 9" opacity="0.4" />
              <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Loading files…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="files-empty-state">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="files-empty-icon">
              <path d="M8 5h16l10 10v20H8V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M24 5v10h10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M14 22h12M14 27h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>{filter ? `No files match "${filter}"` : "No files indexed yet"}</span>
          </div>
        ) : (
          <>
            {visible.map((file) => {
              const isDrive = file.source === "google_drive";
              const isNotion = file.source === "notion";
              const isCloud = isDrive || isNotion;
              const displayName = isCloud && file.displayName ? file.displayName : splitPath(file.path).name;
              const dir = isCloud ? null : splitPath(file.path).dir;
              const age = formatAge(file.modifiedAt);
              const label = getExtLabel(file.ext);
              const tone = getFileTone(file.ext);

              return (
                <div
                  key={file.path}
                  onClick={() => onOpen(file.path)}
                  className="file-row"
                >
                  {isDrive ? (
                    <span className="badge badge--drive" title="Google Drive">
                      <svg width="10" height="10" viewBox="0 0 87.3 78" fill="none">
                        <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.96 8l4.64 5.85z" fill="#0066DA"/>
                        <path d="M43.65 25L29.9 1.2a15.5 15.5 0 00-3.3 3.3L1.96 48.4A15.92 15.92 0 000 56.4h27.5L43.65 25z" fill="#00AC47"/>
                        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.96-8H59.8l5.85 12.35 7.9 14.95z" fill="#EA4335"/>
                        <path d="M43.65 25L57.4 1.2A15.52 15.52 0 0046.1.05a15.7 15.7 0 00-8.1 2.25L16.35 25h27.3z" fill="#00832D"/>
                        <path d="M59.8 56.4h27.5L59.95 8.5a15.72 15.72 0 00-5.75-5.75L40.45 25 59.8 56.4z" fill="#2684FC"/>
                        <path d="M27.5 56.4H59.8L43.65 25 27.5 56.4z" fill="#FFBA00"/>
                      </svg>
                    </span>
                  ) : isNotion ? (
                    <span className="badge badge--notion" title="Notion">N</span>
                  ) : (
                    <span className={`badge badge--${tone}`}>{label}</span>
                  )}
                  <div className="file-row-content">
                    <div className="file-row-name">{displayName}</div>
                    {dir && <div className="file-row-path">{dir}</div>}
                  </div>
                  {age && <span className="file-row-age">{age}</span>}
                  <svg
                    width="12" height="12" viewBox="0 0 12 12" fill="none"
                    className="file-row-arrow"
                  >
                    <path d="M2 6h8M7 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              );
            })}
            {hasMore && (
              <div className="files-load-more">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="btn-secondary"
                >
                  Load more ({(filtered.length - visibleCount).toLocaleString()} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
