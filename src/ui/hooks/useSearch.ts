/**
 * useSearch Hook
 * 
 * Manages search query state and performs document searches.
 * Integrates with the FTS5 search engine to find matching documents.
 * 
 * Features:
 * - Minimum query length enforcement (2 characters)
 * - Command mode detection (queries starting with /)
 * - Automatic result index reset on query change
 * - Error handling for malformed queries
 * 
 * @param query - Current search query string
 * @returns Search results and selected index state
 */

import { useMemo, useState, useEffect } from "react";
import { search, SearchResult } from "../../search/query.js";

/** Minimum characters required before performing a search */
const MIN_QUERY_LENGTH = 2;

/** Maximum number of results to fetch from the database */
const MAX_SEARCH_RESULTS = 10;

interface UseSearchReturn {
  /** Array of matching documents with snippets */
  results: SearchResult[];
  /** Currently selected result index (for keyboard navigation) */
  selectedIndex: number;
  /** Function to update the selected index */
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Hook for performing and managing document searches.
 * 
 * @param query - The search query string (empty or starting with "/" skips search)
 */
export function useSearch(query: string): UseSearchReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Determine if we're in command mode (query starts with /)
  const isCommandMode = query.startsWith("/");

  // Perform the search - memoized to prevent unnecessary re-queries
  const results = useMemo(() => {
    // Don't search in command mode
    if (isCommandMode) return [];

    // Don't search if query is too short
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_QUERY_LENGTH) return [];

    // Attempt the search, returning empty array on error
    try {
      return search(trimmedQuery, MAX_SEARCH_RESULTS);
    } catch {
      // Silently handle errors (malformed queries, etc.)
      return [];
    }
  }, [query, isCommandMode]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length, query]);

  return {
    results,
    selectedIndex,
    setSelectedIndex,
  };
}
