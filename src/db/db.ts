import path from "node:path";
import os from "node:os"
import fs from "node:fs"

import Database from "better-sqlite3";



export function getDbPath(): string {
    const basePath = path.join(os.homedir(), ".incharj")
    fs.mkdirSync(basePath, { recursive: true })
    return path.join(basePath, "index.db")
}


export function openDb(): Database.Database {
    const db = new Database(getDbPath())
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    return db
}

export function resetDb(): void {
    const dbPath = getDbPath();
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    // Also remove WAL files if they exist
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

/**
 * Gets the total count of indexed documents.
 * Returns 0 if the database doesn't exist or has no documents.
 */
export function getDocumentCount(): number {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return 0;
    
    try {
        const db = openDb();
        const result = db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number };
        db.close();
        return result?.count ?? 0;
    } catch {
        return 0;
    }
}

/** Indexed file info */
export interface IndexedFile {
    path: string;
    ext: string;
    sizeBytes: number;
    indexedAt: Date;
}

/**
 * Gets all indexed files with their metadata.
 * Returns empty array if database doesn't exist.
 */
export function getIndexedFiles(): IndexedFile[] {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return [];
    
    try {
        const db = openDb();
        const rows = db.prepare(`
            SELECT path, ext, size_bytes, indexed_at 
            FROM files 
            ORDER BY indexed_at DESC
        `).all() as Array<{ path: string; ext: string; size_bytes: number; indexed_at: number }>;
        db.close();
        
        return rows.map(row => ({
            path: row.path,
            ext: row.ext,
            sizeBytes: row.size_bytes,
            indexedAt: new Date(row.indexed_at)
        }));
    } catch {
        return [];
    }
}