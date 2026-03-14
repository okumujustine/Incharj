import { useEffect, useRef } from "react";
import type { SearchResult } from "../types";
import ResultCard from "./ResultCard";

interface Props {
  results: SearchResult[];
  selectedIdx: number;
  isSearching: boolean;
  onSelect: (result: SearchResult, index: number) => void;
}

export default function ResultsList({ results, selectedIdx, isSearching, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const visibleCount = Math.min(results.length, 60);

  useEffect(() => {
    if (selectedIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("article");
    items[selectedIdx]?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (isSearching && results.length === 0) {
    return (
      <div className="files-empty-state" style={{ height: '100%' }}>
        <svg className="animate-spin-slow" width="16" height="16" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="17 9" opacity="0.4" />
          <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>Searching…</span>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="files-empty-state" style={{ height: '100%' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="files-empty-icon">
          <path d="M8 5h16l10 10v20H8V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M24 5v10h10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 22h12M14 27h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span>No results found</span>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto py-2">
      {results.slice(0, visibleCount).map((r, i) => (
        <ResultCard
          key={r.path}
          result={r}
          index={i}
          selected={i === selectedIdx}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
