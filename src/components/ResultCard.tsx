import type { SearchResult } from "../types";
import { splitPath, formatAge, renderSnippet, getExtLabel, getFileTone } from "../utils";

function FileIcon({ ext }: { ext: string }) {
  const tone = getFileTone(ext);

  return (
    <span className={`file-icon-wrap file-icon-wrap--${tone}`}>
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M4 2.25h4.5l2.5 2.5v7A1.25 1.25 0 0 1 9.75 13H4.25A1.25 1.25 0 0 1 3 11.75v-8.25A1.25 1.25 0 0 1 4.25 2.25H4z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
        <path d="M8.5 2.25v2.5H11" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

interface Props {
  result: SearchResult;
  index: number;
  selected: boolean;
  onSelect: (result: SearchResult, index: number) => void;
}

function GoogleDriveSmallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 87.3 78" fill="none">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0a15.92 15.92 0 001.96 8l4.64 5.85z" fill="#0066DA"/>
      <path d="M43.65 25L29.9 1.2a15.5 15.5 0 00-3.3 3.3L1.96 48.4A15.92 15.92 0 000 56.4h27.5L43.65 25z" fill="#00AC47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25a15.92 15.92 0 001.96-8H59.8l5.85 12.35 7.9 14.95z" fill="#EA4335"/>
      <path d="M43.65 25L57.4 1.2A15.52 15.52 0 0046.1.05a15.7 15.7 0 00-8.1 2.25L16.35 25h27.3z" fill="#00832D"/>
      <path d="M59.8 56.4h27.5L59.95 8.5a15.72 15.72 0 00-5.75-5.75L40.45 25 59.8 56.4z" fill="#2684FC"/>
      <path d="M27.5 56.4H59.8L43.65 25 27.5 56.4z" fill="#FFBA00"/>
    </svg>
  );
}

export default function ResultCard({ result, index, selected, onSelect }: Props) {
  const isDrive = result.source === "google_drive";
  const displayName = isDrive && result.displayName ? result.displayName : splitPath(result.path).name;
  const dir = isDrive ? null : splitPath(result.path).dir;
  const age = formatAge(result.modifiedAt);
  const label = getExtLabel(result.ext);
  const tone = getFileTone(result.ext);

  return (
    <article
      onClick={() => onSelect(result, index)}
      className={[
        "result-card",
        selected ? "result-card-selected" : "",
      ].join(" ")}
    >
      <div className="result-card-inner">
        <div className="result-card-top">
          <FileIcon ext={result.ext} />
          {isDrive ? (
            <span className="badge badge--drive shrink-0" title="Google Drive">
              <GoogleDriveSmallIcon />
            </span>
          ) : (
            <span className={`badge badge--${tone} shrink-0`}>{label}</span>
          )}
          <span className="result-title">
            {displayName}
          </span>
          {age && (
            <span className="result-age">
              {age}
            </span>
          )}
        </div>

        {dir && (
          <div className="result-path-row">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 opacity-60">
              <path
                d="M1 3h8M1 3a1 1 0 0 1 1-1h2l1 1h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="result-path">{dir}</span>
          </div>
        )}

        {result.snippet && (
          <div
            className="result-snippet"
            dangerouslySetInnerHTML={{ __html: renderSnippet(result.snippet) }}
          />
        )}
      </div>
    </article>
  );
}
