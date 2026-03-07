import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import fg from "fast-glob";
import { openDb } from "../db/db.js";
import { ensureSchema } from "../db/schema.js";

const DEFAULT_EXTS = new Set([".md", ".txt", ".json", ".yml", ".yaml"]);

function hashContent(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function safeReadFile(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

export type IndexOptions = {
  roots: string[];
  exts?: string[];
  ignore?: string[];
};

export type IndexProgress = {
  current: number;
  total: number;
  file: string;
};

export type IndexResult = {
  indexed: number;
  skipped: number;
  indexedFiles: string[];
};

// Async generator version for progress updates
export async function* indexWithProgress(opts: IndexOptions): AsyncGenerator<IndexProgress, IndexResult, unknown> {
  ensureSchema();
  const db = openDb();

  const roots = opts.roots.map((r) => path.resolve(r));
  const allowedExts = new Set((opts.exts ?? Array.from(DEFAULT_EXTS)).map((e) => e.startsWith(".") ? e : `.${e}`));
  const ignore = opts.ignore ?? ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"];

  const patterns = roots.map((r) => path.join(r, "**/*"));

  const insertFile = db.prepare(`
    INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime_ms=excluded.mtime_ms,
      size_bytes=excluded.size_bytes,
      ext=excluded.ext,
      content_hash=excluded.content_hash
  `);

  const deleteFts = db.prepare(`DELETE FROM files_fts WHERE rowid = (SELECT id FROM files WHERE path = ?)`);
  const insertFts = db.prepare(`
    INSERT INTO files_fts(rowid, path, content)
    VALUES (
      (SELECT id FROM files WHERE path = ?),
      ?,
      ?
    )
  `);

  const getExisting = db.prepare(`SELECT mtime_ms, size_bytes, content_hash FROM files WHERE path=?`);

  let indexed = 0;
  let skipped = 0;
  const indexedFiles: string[] = [];

  const filePaths = fg.sync(patterns, { dot: true, onlyFiles: true, unique: true, ignore });
  const totalFiles = filePaths.length;

  for (let i = 0; i < filePaths.length; i++) {
    const p = filePaths[i];
    
    // Yield progress every file
    yield { current: i + 1, total: totalFiles, file: p };
    
    const ext = path.extname(p).toLowerCase();
    if (!allowedExts.has(ext)) {
      skipped++;
      continue;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(p);
    } catch {
      skipped++;
      continue;
    }

    const existing = getExisting.get(p) as { mtime_ms: number; size_bytes: number; content_hash: string } | undefined;

    if (existing && existing.mtime_ms === stat.mtimeMs && existing.size_bytes === stat.size) {
      skipped++;
      continue;
    }

    const buf = safeReadFile(p);
    if (!buf) {
      skipped++;
      continue;
    }

    const h = hashContent(buf);

    if (existing && existing.content_hash === h) {
      insertFile.run(p, stat.mtimeMs, stat.size, ext, h);
      skipped++;
      continue;
    }

    const content = buf.toString("utf8");
    insertFile.run(p, stat.mtimeMs, stat.size, ext, h);
    deleteFts.run(p);
    insertFts.run(p, p, content);
    indexedFiles.push(p);
    indexed++;
  }

  db.close();
  return { indexed, skipped, indexedFiles };
}

export function indexOnce(opts: IndexOptions): IndexResult {
  ensureSchema();
  const db = openDb();

  const roots = opts.roots.map((r) => path.resolve(r));
  const allowedExts = new Set((opts.exts ?? Array.from(DEFAULT_EXTS)).map((e) => e.startsWith(".") ? e : `.${e}`));
  const ignore = opts.ignore ?? ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"];

  const patterns = roots.map((r) => path.join(r, "**/*"));

  const insertFile = db.prepare(`
    INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime_ms=excluded.mtime_ms,
      size_bytes=excluded.size_bytes,
      ext=excluded.ext,
      content_hash=excluded.content_hash
  `);

  // FTS5 doesn't support UPSERT, so delete then insert
  const deleteFts = db.prepare(`DELETE FROM files_fts WHERE rowid = (SELECT id FROM files WHERE path = ?)`);
  const insertFts = db.prepare(`
    INSERT INTO files_fts(rowid, path, content)
    VALUES (
      (SELECT id FROM files WHERE path = ?),
      ?,
      ?
    )
  `);

  const getExisting = db.prepare(`SELECT mtime_ms, size_bytes, content_hash FROM files WHERE path=?`);

  let indexed = 0;
  let skipped = 0;
  const indexedFiles: string[] = [];

  const filePaths = fg.sync(patterns, { dot: true, onlyFiles: true, unique: true, ignore });

  const tx = db.transaction(() => {
    for (const p of filePaths) {
      const ext = path.extname(p).toLowerCase();
      if (!allowedExts.has(ext)) {
        skipped++;
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(p);
      } catch {
        skipped++;
        continue;
      }

      const existing = getExisting.get(p) as { mtime_ms: number; size_bytes: number; content_hash: string } | undefined;

      // Quick skip: if mtime & size match, assume unchanged
      if (existing && existing.mtime_ms === stat.mtimeMs && existing.size_bytes === stat.size) {
        skipped++;
        continue;
      }

      const buf = safeReadFile(p);
      if (!buf) {
        skipped++;
        continue;
      }

      const h = hashContent(buf);

      // Skip if content hash unchanged even if mtime changed
      if (existing && existing.content_hash === h) {
        insertFile.run(p, stat.mtimeMs, stat.size, ext, h);
        skipped++;
        continue;
      }

      const content = buf.toString("utf8");
      insertFile.run(p, stat.mtimeMs, stat.size, ext, h);
      deleteFts.run(p);
      insertFts.run(p, p, content);
      indexedFiles.push(p);
      indexed++;
    }
  });

  tx();
  db.close();
  return { indexed, skipped, indexedFiles };
}