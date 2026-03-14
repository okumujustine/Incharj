import type { AppState, FilterType } from "../types";
import { shortenPath } from "../utils";

interface Props {
  appState: AppState | null;
  activeFilter: FilterType;
  activeFolder: string | null;
  activeExtensions: string[];
  fileTypeCounts: Record<FilterType, number>;
  extensionCounts: Record<string, number>;
  onFilterChange: (filter: FilterType) => void;
  onFolderChange: (folder: string | null) => void;
  onExtensionToggle: (ext: string) => void;
}

const FILTER_ITEMS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { 
    key: "all", 
    label: "All files",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  { 
    key: "documents", 
    label: "Documents",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 2h5.5L13 5.5V14H4V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M6 9h5M6 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  { 
    key: "code", 
    label: "Code",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M5 4.5L2 8l3 3.5M11 4.5l3 3.5-3 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  { 
    key: "pdf", 
    label: "PDFs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 6h6M5 8.5h6M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  { 
    key: "recent", 
    label: "Recent",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 5.5h12M2 5.5A1.5 1.5 0 0 1 3.5 4h3l1.5 1.5h5.5A1.5 1.5 0 0 1 15 7v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function Section({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <section className="sidebar-section">
      <header className="sidebar-section-header">
        <span>{title}</span>
        {collapsible && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="sidebar-chevron">
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </header>
      <div className="sidebar-section-body">{children}</div>
    </section>
  );
}

export default function SearchSidebar({
  appState,
  activeFilter,
  activeFolder,
  activeExtensions,
  fileTypeCounts,
  extensionCounts,
  onFilterChange,
  onFolderChange,
  onExtensionToggle,
}: Props) {
  const folders = appState?.folders ?? [];
  const extensions = appState?.extensions ?? [];

  return (
    <aside className="search-sidebar">
      {/* Filters Section */}
      <Section title="Filter">
        <div className="sidebar-filter-grid">
          {FILTER_ITEMS.map(({ key, label, icon }) => {
            const count = fileTypeCounts[key];
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                className={isActive ? "sidebar-filter-btn active" : "sidebar-filter-btn"}
                onClick={() => onFilterChange(key)}
              >
                <span className="sidebar-filter-icon">{icon}</span>
                <span className="sidebar-filter-label">{label}</span>
                {count > 0 && <span className="sidebar-filter-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Folders Section */}
      {folders.length > 0 && (
        <Section title="Locations">
          <button
            className={activeFolder === null ? "sidebar-row active" : "sidebar-row"}
            onClick={() => onFolderChange(null)}
          >
            <span className="sidebar-icon"><FolderIcon /></span>
            <span className="sidebar-label">All locations</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder}
              className={activeFolder === folder ? "sidebar-row active" : "sidebar-row"}
              onClick={() => onFolderChange(activeFolder === folder ? null : folder)}
              title={folder}
            >
              <span className="sidebar-icon"><FolderIcon /></span>
              <span className="sidebar-label truncate">{shortenPath(folder)}</span>
            </button>
          ))}
        </Section>
      )}

      {/* File Types Section */}
      {extensions.length > 0 && (
        <Section title="File types">
          <div className="sidebar-ext-grid">
            {extensions.map((ext) => {
              const selected = activeExtensions.includes(ext);
              const count = extensionCounts[ext] ?? 0;
              return (
                <button
                  key={ext}
                  className={selected ? "sidebar-ext-chip active" : "sidebar-ext-chip"}
                  onClick={() => onExtensionToggle(ext)}
                >
                  <span className="sidebar-ext-label">{ext}</span>
                  {count > 0 && <span className="sidebar-ext-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </aside>
  );
}
