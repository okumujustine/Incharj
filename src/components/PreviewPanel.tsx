import { useState } from "react";
import type { SearchResult } from "../types";
import { splitPath, formatAge, renderSnippet, getExtLabel, getFileTone } from "../utils";

interface Props {
  result: SearchResult;
  onClose: () => void;
  onOpen: (path: string) => void;
  onReveal: (path: string) => void;
}

export default function PreviewPanel({ result, onClose, onOpen, onReveal }: Props) {
  const { name, dir } = splitPath(result.path);
  const age = formatAge(result.modifiedAt);
  const label = getExtLabel(result.ext);
  const tone = getFileTone(result.ext);
  const [copied, setCopied] = useState(false);

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(result.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside 
      className="preview-panel w-[360px] shrink-0 flex flex-col animate-slide-in overflow-hidden"
    >
      <div className="preview-header">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className={`badge badge--${tone}`}>
            {label}
          </span>
          <button
            onClick={onClose}
            className="btn-ghost w-8 h-8 rounded-lg"
            aria-label="Close preview"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <h2 
          className="text-[15px] font-semibold leading-snug truncate mb-1.5"
          style={{ color: "var(--c-text-primary)" }}
        >
          {name}
        </h2>
        {dir && (
          <p className="preview-path">
            {dir}
          </p>
        )}

        <div className="preview-meta-grid">
          <div>
            <div className="preview-meta-label">
              File type
            </div>
            <div className="preview-meta-value preview-meta-code">
              {label}
            </div>
          </div>
          <div>
            <div className="preview-meta-label">
              Last updated
            </div>
            <div className="preview-meta-value">
              {age || "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="preview-meta-label mb-3">
          Preview
        </div>
        {result.snippet ? (
          <div
            className="preview-snippet"
            dangerouslySetInnerHTML={{ __html: renderSnippet(result.snippet) }}
          />
        ) : (
          <div className="preview-empty">
            Nothing to preview here yet.
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button
          onClick={() => onOpen(result.path)}
          className="btn-primary w-full h-11"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1.5 7h11M8 2.5l4.5 4.5L8 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Open
        </button>
        <div className="flex gap-2.5">
          <button
            onClick={() => onReveal(result.path)}
            className="btn-secondary flex-1 h-10"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 1.5h4.5v4.5M6 6l5.5-5M11.5 6v5.5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Show in folder
          </button>
          <button
            onClick={handleCopyPath}
            className={`btn-secondary flex-1 h-10 ${copied ? "btn-secondary-success" : ""}`}
          >
            {copied ? (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 6.5l3.5 3.5 5.5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4.5 4.5V2.5A1.5 1.5 0 0 0 3 1H2A1.5 1.5 0 0 0 .5 2.5v6A1.5 1.5 0 0 0 2 10h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Copy location
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
