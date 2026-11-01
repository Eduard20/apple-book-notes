import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Local SQLite file. Lives in the repo-level data/ folder (gitignored). */
export const DB_PATH = resolve(process.env.DB_PATH ?? resolve(process.cwd(), "../../data/notes.db"));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id           TEXT PRIMARY KEY,          -- Apple asset ID
  title        TEXT NOT NULL,             -- from Apple Books
  custom_title TEXT,                      -- user override, never touched by import
  author       TEXT,
  custom_author TEXT,
  genre        TEXT,
  in_library   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS highlights (
  id             TEXT PRIMARY KEY,        -- Apple annotation UUID
  book_id        TEXT NOT NULL REFERENCES books(id),
  text           TEXT NOT NULL,
  note           TEXT,
  color          TEXT NOT NULL,
  chapter        TEXT,
  context        TEXT,
  location       TEXT,
  sort_key       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT,
  modified_at    TEXT,
  removed        INTEGER NOT NULL DEFAULT 0,  -- deleted in Apple Books since last import
  favorite       INTEGER NOT NULL DEFAULT 0,
  categorized_at TEXT                          -- null = not yet categorized by AI
);
CREATE INDEX IF NOT EXISTS highlights_book ON highlights(book_id, sort_key);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS highlight_categories (
  highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, category_id)
);
CREATE INDEX IF NOT EXISTS hc_category ON highlight_categories(category_id);

CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
  text, note, content='highlights', content_rowid='rowid',
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __abnDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__abnDb) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    const conn = new DatabaseSync(DB_PATH);
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    // Normalized text for de-duplicating highlights that arrive via different routes.
    conn.function("text_key", { deterministic: true }, (t) => textKey(String(t ?? "")));
    g.__abnDb = conn;
  }
  return g.__abnDb;
}

export function transaction<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function getMeta(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Lowercase, strip quotes/punctuation/whitespace: same highlight from Mac DB vs. iOS share text → same key. */
export function textKey(t: string): string {
  return t.toLowerCase().replace(/[\s"'“”«»„‘’.,;:!?…—–-]+/g, "");
}
