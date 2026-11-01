import "server-only";
import { extract } from "@abn/extractor";
import { db, setMeta, transaction } from "./db";

export interface ImportResult {
  books: number;
  highlights: number;
  added: number;
  removed: number;
}

/**
 * Pull everything from Apple Books into the local DB.
 * Upserts by Apple's IDs, so re-importing never duplicates and never touches
 * user data (favorites, categories, renamed books).
 */
export function importFromAppleBooks(): ImportResult {
  const data = extract();
  const d = db();

  return transaction(() => {
    const before = (d.prepare("SELECT count(*) n FROM highlights").get() as { n: number }).n;

    const upsertBook = d.prepare(
      `INSERT INTO books (id, title, author, genre, in_library) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         -- keep a previously known real title if the book was since removed from the library
         title = CASE WHEN excluded.in_library = 1 OR books.in_library = 0 THEN excluded.title ELSE books.title END,
         author = COALESCE(excluded.author, books.author),
         genre = COALESCE(excluded.genre, books.genre),
         in_library = excluded.in_library`,
    );
    for (const b of data.books) upsertBook.run(b.id, b.title, b.author, b.genre, b.inLibrary ? 1 : 0);

    const upsertHighlight = d.prepare(
      `INSERT INTO highlights (id, book_id, text, note, color, chapter, context, location, sort_key, created_at, modified_at, removed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO UPDATE SET
         book_id = excluded.book_id, note = excluded.note, color = excluded.color,
         chapter = excluded.chapter, context = excluded.context, location = excluded.location,
         sort_key = excluded.sort_key, modified_at = excluded.modified_at, removed = 0,
         -- text changed (rare) → let the AI re-categorize it
         categorized_at = CASE WHEN highlights.text = excluded.text THEN highlights.categorized_at ELSE NULL END,
         text = excluded.text`,
    );
    for (const h of data.highlights) {
      upsertHighlight.run(
        h.id, h.bookId, h.text, h.note, h.color, h.chapter, h.context, h.location, h.sortKey, h.createdAt, h.modifiedAt,
      );
    }

    // Count before de-duplication below, so "new" means new from Apple Books.
    const added = (d.prepare("SELECT count(*) n FROM highlights").get() as { n: number }).n - before;

    // Highlights deleted in Apple Books: hide them, but keep the row so tags/favorites survive a mistake.
    d.exec("CREATE TEMP TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY)");
    d.exec("DELETE FROM seen");
    const ins = d.prepare("INSERT INTO seen (id) VALUES (?)");
    for (const h of data.highlights) ins.run(h.id);
    // (Highlights shared from the phone have "shared:" IDs and aren't in Apple's DB, so leave them alone.)
    const removed = d
      .prepare("UPDATE highlights SET removed = 1 WHERE removed = 0 AND id NOT LIKE 'shared:%' AND id NOT IN (SELECT id FROM seen)")
      .run().changes;

    // A highlight shared from the phone that has since arrived via iCloud → keep the Apple copy
    // (it has color + position), carrying over the user's favorite.
    d.exec(`
      UPDATE highlights SET favorite = 1
       WHERE id NOT LIKE 'shared:%' AND favorite = 0
         AND text_key(text) IN (SELECT text_key(text) FROM highlights WHERE id LIKE 'shared:%' AND favorite = 1);
      DELETE FROM highlights
       WHERE id LIKE 'shared:%'
         AND text_key(text) IN (SELECT text_key(text) FROM highlights WHERE id NOT LIKE 'shared:%');
    `);

    d.exec("INSERT INTO highlights_fts(highlights_fts) VALUES ('rebuild')");
    setMeta("last_import_at", new Date().toISOString());

    return { books: data.books.length, highlights: data.highlights.length, added, removed: Number(removed) };
  });
}
