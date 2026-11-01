import "server-only";
import { createHash } from "node:crypto";
import { db, textKey, transaction } from "./db";

export interface SharedHighlight {
  text: string;
  note?: string | null;
  bookTitle: string;
  author?: string | null;
  sharedAt?: string | null;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Store highlights shared from Apple Books on the phone.
 * - Book: matched to an existing book by title (incl. renamed titles), else created.
 * - Highlight: skipped if the same text already exists (e.g. it already came in via the Mac import).
 * IDs are deterministic, so sending the same share twice is harmless.
 */
export function ingestShared(items: SharedHighlight[]) {
  const d = db();
  const books = d.prepare("SELECT id, title, custom_title FROM books").all() as Array<{ id: string; title: string; custom_title: string | null }>;
  const byTitle = new Map<string, string>();
  for (const b of books) {
    byTitle.set(titleKey(b.title), b.id);
    if (b.custom_title) byTitle.set(titleKey(b.custom_title), b.id);
  }
  const existingKeys = new Set(
    (d.prepare("SELECT text FROM highlights WHERE removed = 0").all() as Array<{ text: string }>).map((r) => textKey(r.text)),
  );

  const insBook = d.prepare("INSERT OR IGNORE INTO books (id, title, author, in_library) VALUES (?, ?, ?, 1)");
  const insHl = d.prepare(
    `INSERT OR IGNORE INTO highlights (id, book_id, text, note, color, sort_key, created_at, modified_at)
     VALUES (?, ?, ?, ?, 'unknown', ?, ?, ?)`,
  );

  let added = 0;
  let duplicates = 0;
  transaction(() => {
    items.forEach((it, i) => {
      const text = it.text.trim();
      if (!text) return;
      const key = textKey(text);
      if (existingKeys.has(key)) return void duplicates++;

      const title = it.bookTitle.trim() || "Unknown book";
      let bookId = byTitle.get(titleKey(title));
      if (!bookId) {
        bookId = `shared:${hash(titleKey(title))}`;
        insBook.run(bookId, title, it.author?.trim() || null);
        byTitle.set(titleKey(title), bookId);
      }
      const when = it.sharedAt ?? new Date().toISOString();
      const res = insHl.run(`shared:${hash(bookId + key)}`, bookId, text, it.note?.trim() || null, 100000 + i, when, when);
      if (res.changes) added++;
      else duplicates++;
      existingKeys.add(key);
    });
    if (added) d.exec("INSERT INTO highlights_fts(highlights_fts) VALUES ('rebuild')");
  });
  return { added, duplicates };
}
