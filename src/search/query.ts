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
  const hasChunkRows = Boolean(db.prepare(`SELECT 1 FROM files_fts_chunks LIMIT 1`).get());

  // Query chunk index, then collapse to one best row per file.
  const stmt = db.prepare(`
    WITH matched AS (
      SELECT
        path,
        snippet(files_fts_chunks, 2, '<<MATCH>>', '<<END>>', ' … ', 64) AS snippet,
        bm25(files_fts_chunks) AS rank
      FROM files_fts_chunks
      WHERE files_fts_chunks MATCH ?
    ),
    ranked AS (
      SELECT
        path,
        snippet,
        rank,
        COUNT(*) OVER (PARTITION BY path) AS occurrences,
        ROW_NUMBER() OVER (PARTITION BY path ORDER BY rank ASC) AS row_num
      FROM matched
    )
    SELECT path, snippet, rank, occurrences
    FROM ranked
    WHERE row_num = 1
    ORDER BY rank
    LIMIT ?
  `);

  // FTS5 MATCH syntax can break if user types special chars; wrap naive quoting
  const safe = term.trim().length ? term.trim().replace(/["']/g, " ") : "";
  let results = safe ? (stmt.all(safe, limit) as any[]) : [];
  if (safe && !hasChunkRows) {
    const legacyStmt = db.prepare(`
      SELECT
        path,
        snippet(files_fts, 1, '<<MATCH>>', '<<END>>', ' … ', 64) AS snippet,
        bm25(files_fts) AS rank,
        1 AS occurrences
      FROM files_fts
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    results = legacyStmt.all(safe, limit) as any[];
  }

  db.close();

  return results.map((r) => {
    return {
      path: r.path as string,
      snippet: (r.snippet as string) ?? "",
      rank: Number(r.rank),
      occurrences: Math.max(1, Number(r.occurrences ?? 1))
    };
  });
}
