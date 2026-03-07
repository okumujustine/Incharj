import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import fg from "fast-glob";
import { PDFParse } from "pdf-parse";
import { openDb } from "../db/db.js";
import { ensureSchema } from "../db/schema.js";

const DEFAULT_EXTS = new Set([".md", ".txt", ".json", ".yml", ".yaml", ".pdf"]);
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_PDF_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const FTS_CHUNK_SIZE = 4000;
const FTS_CHUNK_OVERLAP = 300;

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

async function extractIndexableText(filePath: string, ext: string, buf: Buffer): Promise<string | null> {
  if (ext === ".pdf") {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: buf });
      // Parse full PDF text (no page cap); chunking keeps memory/search practical.
      const result = await parser.getText();
      const text = (result.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return text.length > 0 ? text : null;
    } catch {
      return null;
    } finally {
      if (parser) {
        await parser.destroy();
      }
    }
  }

  try {
    const text = buf
      .toString("utf8")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function splitIntoChunks(text: string, chunkSize = FTS_CHUNK_SIZE, overlap = FTS_CHUNK_OVERLAP): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (i + chunkSize >= text.length) break;
  }
  return chunks;
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
    INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime_ms=excluded.mtime_ms,
      size_bytes=excluded.size_bytes,
      ext=excluded.ext,
      content_hash=excluded.content_hash,
      indexed_at=excluded.indexed_at
  `);

  const deleteFtsChunks = db.prepare(`DELETE FROM files_fts_chunks WHERE path = ?`);
  const insertFtsChunk = db.prepare(`
    INSERT INTO files_fts_chunks(path, chunk_index, content)
    VALUES (?, ?, ?)
  `);

  const getExisting = db.prepare(`SELECT mtime_ms, size_bytes, content_hash FROM files WHERE path=?`);

  try {
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

      const maxBytes = ext === ".pdf" ? MAX_PDF_FILE_BYTES : MAX_TEXT_FILE_BYTES;
      if (stat.size > maxBytes) {
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
      const indexedAt = Date.now();

      if (existing && existing.content_hash === h) {
        insertFile.run(p, stat.mtimeMs, stat.size, ext, h, indexedAt);
        skipped++;
        continue;
      }

      const content = await extractIndexableText(p, ext, buf);
      if (!content) {
        skipped++;
        continue;
      }
      const chunks = splitIntoChunks(content);
      if (chunks.length === 0) {
        skipped++;
        continue;
      }
      insertFile.run(p, stat.mtimeMs, stat.size, ext, h, indexedAt);
      deleteFtsChunks.run(p);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        insertFtsChunk.run(p, chunkIndex, chunks[chunkIndex]);
      }
      indexedFiles.push(p);
      indexed++;
    }

    return { indexed, skipped, indexedFiles };
  } finally {
    db.close();
  }
}

export function indexOnce(opts: IndexOptions): IndexResult {
  ensureSchema();
  const db = openDb();

  const roots = opts.roots.map((r) => path.resolve(r));
  const allowedExts = new Set((opts.exts ?? Array.from(DEFAULT_EXTS)).map((e) => e.startsWith(".") ? e : `.${e}`));
  const ignore = opts.ignore ?? ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"];

  const patterns = roots.map((r) => path.join(r, "**/*"));

  const insertFile = db.prepare(`
    INSERT INTO files(path, mtime_ms, size_bytes, ext, content_hash, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      mtime_ms=excluded.mtime_ms,
      size_bytes=excluded.size_bytes,
      ext=excluded.ext,
      content_hash=excluded.content_hash,
      indexed_at=excluded.indexed_at
  `);

  // FTS5 doesn't support UPSERT, so delete then insert
  const deleteFtsChunks = db.prepare(`DELETE FROM files_fts_chunks WHERE path = ?`);
  const insertFtsChunk = db.prepare(`
    INSERT INTO files_fts_chunks(path, chunk_index, content)
    VALUES (?, ?, ?)
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
      if (ext === ".pdf") {
        // indexOnce is synchronous; PDF extraction is async in indexWithProgress.
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

      if (stat.size > MAX_TEXT_FILE_BYTES) {
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
        insertFile.run(p, stat.mtimeMs, stat.size, ext, h, Date.now());
        skipped++;
        continue;
      }

      const content = buf.toString("utf8").replace(/\s+/g, " ").trim();
      const chunks = splitIntoChunks(content);
      if (chunks.length === 0) {
        skipped++;
        continue;
      }
      insertFile.run(p, stat.mtimeMs, stat.size, ext, h, Date.now());
      deleteFtsChunks.run(p);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        insertFtsChunk.run(p, chunkIndex, chunks[chunkIndex]);
      }
      indexedFiles.push(p);
      indexed++;
    }
  });

  tx();
  db.close();
  return { indexed, skipped, indexedFiles };
}
