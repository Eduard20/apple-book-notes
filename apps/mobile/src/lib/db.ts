import type { SQLiteDatabase } from "expo-sqlite";
import type { ExportPayload, Filters, Highlight } from "./types";

export const DB_NAME = "booknotes.db";

// Library snapshot baked into the app at build time (npm run bundle-library). Empty placeholder otherwise.
const BUNDLED: ExportPayload | { exportedAt: null } = require("../data/library.json");

/** Called once by <SQLiteProvider onInit>. */
export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, in_library INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT);
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL, text TEXT NOT NULL, note TEXT, color TEXT NOT NULL,
      chapter TEXT, sort_key INTEGER NOT NULL DEFAULT 0, created_at TEXT, favorite INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS highlights_book ON highlights(book_id, sort_key);
    CREATE TABLE IF NOT EXISTS highlight_categories (highlight_id TEXT NOT NULL, category_id INTEGER NOT NULL, PRIMARY KEY (highlight_id, category_id));
    CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
      text, note, content='highlights', content_rowid='rowid', tokenize = "unicode61 remove_diacritics 2"
    );
    -- Outbox: things done on the phone that the Mac hasn't seen yet.
    CREATE TABLE IF NOT EXISTS pending_shared (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, note TEXT,
      book_title TEXT NOT NULL, author TEXT, shared_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_favorites (highlight_id TEXT PRIMARY KEY, favorite INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  await loadBundledLibrary(db);
}

/**
 * If this build carries a newer library than the phone has (from a previous build or a Wi-Fi sync),
 * load it. Highlights shared on the phone and favorites not yet sent to the Mac are kept.
 */
async function loadBundledLibrary(db: SQLiteDatabase) {
  const snap = BUNDLED;
  if (!snap.exportedAt) return;
  const current = (await getMeta(db, "library_at")) ?? "";
  if (snap.exportedAt <= current) return;
  await replaceWithSnapshot(db, snap as ExportPayload);
  await setMeta(db, "library_at", snap.exportedAt);
}

export async function getMeta(db: SQLiteDatabase, key: string) {
  return (await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key))?.value ?? null;
}
export async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

const ftsQuery = (q: string) => {
  const terms = q.split(/\s+/).map((t) => t.replace(/"/g, "").trim()).filter(Boolean);
  return terms.length ? terms.map((t) => `"${t}"*`).join(" ") : null;
};

export async function listHighlights(db: SQLiteDatabase, f: Filters, limit = 60, offset = 0): Promise<Highlight[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const fts = f.q ? ftsQuery(f.q) : null;
  const add = (sql: string, ...p: (string | number)[]) => {
    where.push(sql);
    params.push(...p);
  };
  if (fts) add("h.rowid IN (SELECT rowid FROM highlights_fts WHERE highlights_fts MATCH ?)", fts);
  if (f.bookId) add("h.book_id = ?", f.bookId);
  if (f.color) add("h.color = ?", f.color);
  if (f.favorite) add("h.favorite = 1");
  if (f.categoryId) add("EXISTS (SELECT 1 FROM highlight_categories hc WHERE hc.highlight_id = h.id AND hc.category_id = ?)", f.categoryId);

  const rows = await db.getAllAsync<Record<string, string | number | null>>(
    `SELECT h.id, h.text, h.note, h.color, h.chapter, h.created_at, h.favorite, h.pending,
            b.id book_id, b.title book_title, b.author book_author,
            (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
               FROM highlight_categories hc JOIN categories c ON c.id = hc.category_id
              WHERE hc.highlight_id = h.id) cats
     FROM highlights h JOIN books b ON b.id = h.book_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY ${f.bookId ? "h.sort_key" : "h.pending DESC, h.created_at DESC"}
     LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return rows.map((r) => ({
    id: r.id as string,
    text: r.text as string,
    note: r.note as string | null,
    color: r.color as Highlight["color"],
    chapter: r.chapter as string | null,
    createdAt: r.created_at as string | null,
    favorite: r.favorite === 1,
    pending: r.pending === 1,
    bookId: r.book_id as string,
    bookTitle: r.book_title as string,
    bookAuthor: r.book_author as string | null,
    categories: JSON.parse((r.cats as string) ?? "[]"),
  }));
}

export async function listBooks(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: string; title: string; author: string | null; n: number }>(
    `SELECT b.id, b.title, b.author, count(h.id) n FROM books b JOIN highlights h ON h.book_id = b.id
     GROUP BY b.id ORDER BY n DESC`,
  );
}

export async function listCategories(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: number; name: string; description: string | null; n: number }>(
    `SELECT c.id, c.name, c.description, count(hc.highlight_id) n FROM categories c
     LEFT JOIN highlight_categories hc ON hc.category_id = c.id GROUP BY c.id ORDER BY n DESC, c.name`,
  );
}

export async function listColors(db: SQLiteDatabase) {
  return db.getAllAsync<{ color: Highlight["color"]; n: number }>(
    "SELECT color, count(*) n FROM highlights WHERE color != 'unknown' GROUP BY color ORDER BY n DESC",
  );
}

export async function counts(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ highlights: number; favorites: number; pendingShared: number; pendingFavs: number }>(
    `SELECT (SELECT count(*) FROM highlights) highlights,
            (SELECT count(*) FROM highlights WHERE favorite = 1) favorites,
            (SELECT count(*) FROM pending_shared) pendingShared,
            (SELECT count(*) FROM pending_favorites) pendingFavs`,
  );
  return r!;
}

export async function toggleFavorite(db: SQLiteDatabase, id: string, favorite: boolean) {
  await db.runAsync("UPDATE highlights SET favorite = ? WHERE id = ?", favorite ? 1 : 0, id);
  // Phone-only highlights don't exist on the Mac yet; their favorite rides along later.
  if (!id.startsWith("local:"))
    await db.runAsync(
      "INSERT INTO pending_favorites (highlight_id, favorite) VALUES (?, ?) ON CONFLICT(highlight_id) DO UPDATE SET favorite = excluded.favorite",
      id, favorite ? 1 : 0,
    );
}

/** Save highlights shared from Apple Books: visible immediately, queued for the Mac. */
export async function addShared(
  db: SQLiteDatabase,
  book: { title: string; author: string | null },
  items: { text: string; note?: string | null }[],
) {
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ id: string }>("SELECT id FROM books WHERE lower(title) = lower(?)", book.title);
    const bookId = existing?.id ?? `local:${book.title}`;
    if (!existing) await db.runAsync("INSERT OR IGNORE INTO books (id, title, author) VALUES (?, ?, ?)", bookId, book.title, book.author);
    for (const it of items) {
      const r = await db.runAsync(
        "INSERT INTO pending_shared (text, note, book_title, author, shared_at) VALUES (?, ?, ?, ?, ?)",
        it.text, it.note ?? null, book.title, book.author, now,
      );
      await db.runAsync(
        "INSERT INTO highlights (id, book_id, text, note, color, sort_key, created_at, pending) VALUES (?, ?, ?, ?, 'unknown', ?, ?, 1)",
        `local:${r.lastInsertRowId}`, bookId, it.text, it.note ?? null, 100000 + r.lastInsertRowId, now,
      );
    }
    await db.execAsync("INSERT INTO highlights_fts(highlights_fts) VALUES ('rebuild')");
  });
}

/** Replace the local mirror with the Mac's snapshot, keeping anything still waiting in the outbox. */
export async function replaceWithSnapshot(db: SQLiteDatabase, s: ExportPayload) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      "DELETE FROM highlight_categories; DELETE FROM highlights WHERE pending = 0; DELETE FROM categories; DELETE FROM books WHERE id NOT LIKE 'local:%';",
    );
    const insBook = await db.prepareAsync("INSERT OR REPLACE INTO books (id, title, author, in_library) VALUES (?, ?, ?, ?)");
    const insCat = await db.prepareAsync("INSERT INTO categories (id, name, description) VALUES (?, ?, ?)");
    const insHl = await db.prepareAsync(
      "INSERT OR REPLACE INTO highlights (id, book_id, text, note, color, chapter, sort_key, created_at, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insHc = await db.prepareAsync("INSERT OR IGNORE INTO highlight_categories (highlight_id, category_id) VALUES (?, ?)");
    try {
      for (const b of s.books) await insBook.executeAsync(b.id, b.title, b.author, b.inLibrary ? 1 : 0);
      for (const c of s.categories) await insCat.executeAsync(c.id, c.name, c.description);
      for (const h of s.highlights) {
        await insHl.executeAsync(h.id, h.bookId, h.text, h.note, h.color, h.chapter, h.sortKey, h.createdAt, h.favorite ? 1 : 0);
        for (const c of h.categoryIds) await insHc.executeAsync(h.id, c);
      }
    } finally {
      await Promise.all([insBook, insCat, insHl, insHc].map((st) => st.finalizeAsync()));
    }
    // Favorites toggled on the phone that the Mac hasn't confirmed yet win over the snapshot.
    await db.execAsync(
      "UPDATE highlights SET favorite = (SELECT favorite FROM pending_favorites p WHERE p.highlight_id = highlights.id) WHERE id IN (SELECT highlight_id FROM pending_favorites);",
    );
    await db.execAsync("DELETE FROM books WHERE id LIKE 'local:%' AND id NOT IN (SELECT book_id FROM highlights);");
    await db.execAsync("INSERT INTO highlights_fts(highlights_fts) VALUES ('rebuild')");
  });
}
