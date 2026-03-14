import type { FilterType, SearchResult } from "../types";
import { getFileKind } from "../utils";

interface Props {
  filter: FilterType;
  onChange: (f: FilterType) => void;
  results: SearchResult[];
}

export default function FilterChips({ filter, onChange, results }: Props) {
  const counts = {
    all:       results.length,
    documents: results.filter((r) => getFileKind(r.ext) === "doc").length,
    code:      results.filter((r) => getFileKind(r.ext) === "code").length,
    pdf:       results.filter((r) => getFileKind(r.ext) === "pdf").length,
    recent:    results.filter((r) => (Date.now() - r.modifiedAt) / 86_400_000 <= 7).length,
  };

  const chips: { key: FilterType; label: string }[] = [
    { key: "all",       label: "All" },
    { key: "documents", label: "Docs" },
    { key: "code",      label: "Code" },
    { key: "pdf",       label: "PDF" },
    { key: "recent",    label: "Recent" },
  ];

  return (
    <div className="flex items-center gap-2 pt-3">
      {chips.map(({ key, label }) => {
        const active = filter === key;
        const count = counts[key];
        if (key !== "all" && count === 0) return null;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`chip ${active ? "active" : ""}`}
          >
            {label}
            {key !== "all" && (
              <span 
                className="tabular-nums text-xs font-semibold"
                style={{ 
                  opacity: active ? 0.8 : 0.5
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
