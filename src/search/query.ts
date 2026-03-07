import { openDb } from "../db/db.js";
import { ensureSchema } from "../db/schema.js";

export type SearchResult = {
  path: string;
  snippet: string;
  rank: number;
  occurrences: number;
};

export function search(term: string, limit = 20): SearchResult[] {
  ensureSchema();
  const db = openDb();

  // bm25 gives relevance; snippet gives highlighted context
  const stmt = db.prepare(`
    SELECT
      path,
      content,
      snippet(files_fts, 1, '<<MATCH>>', '<<END>>', ' … ', 64) AS snippet,
      bm25(files_fts) AS rank
    FROM files_fts
    WHERE files_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  // FTS5 MATCH syntax can break if user types special chars; wrap naive quoting
  const safe = term.trim().length ? term.trim().replace(/["']/g, " ") : "";
  const results = safe ? (stmt.all(safe, limit) as any[]) : [];

  db.close();

  // Count occurrences of the search term in content (case-insensitive)
  const termLower = safe.toLowerCase();
  
  return results.map((r) => {
    const content = ((r.content as string) ?? "").toLowerCase();
    const occurrences = content.split(termLower).length - 1;
    return {
      path: r.path as string,
      snippet: (r.snippet as string) ?? "",
      rank: Number(r.rank),
      occurrences: Math.max(1, occurrences)
    };
  });
}