import "server-only";
import { connection } from "next/server";
import { db, getMeta } from "./db";
import type { BookDTO, CategoryDTO, HighlightDTO, HighlightFilters, Stats } from "./types";

// node:sqlite is synchronous; with Cache Components, sync work would be frozen into the
// prerendered shell. `await connection()` makes every read run at request time.

const BOOK_TITLE = "COALESCE(b.custom_title, b.title)";
const BOOK_AUTHOR = "COALESCE(b.custom_author, b.author)";

/** Turn free text into a safe FTS5 prefix query: `"risk"* "антихруп"*` */
function ftsQuery(q: string): string | null {
  const terms = q
    .split(/\s+/)
    .map((t) => t.replace(/"/g, "").trim())
    .filter(Boolean);
  return terms.length ? terms.map((t) => `"${t}"*`).join(" ") : null;
}

export async function getStats(): Promise<Stats> {
  await connection();
  const d = db();
  const one = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  return {
    highlights: one("SELECT count(*) n FROM highlights WHERE removed = 0"),
    books: one("SELECT count(DISTINCT book_id) n FROM highlights WHERE removed = 0"),
    categories: one("SELECT count(*) n FROM categories"),
    uncategorized: one("SELECT count(*) n FROM highlights WHERE removed = 0 AND categorized_at IS NULL"),
    favorites: one("SELECT count(*) n FROM highlights WHERE removed = 0 AND favorite = 1"),
    lastImportAt: getMeta("last_import_at"),
  };
}

export async function listBooks(): Promise<BookDTO[]> {
  await connection();
  const rows = db()
    .prepare(
      `SELECT b.id, ${BOOK_TITLE} title, ${BOOK_AUTHOR} author, b.in_library, count(h.id) n
       FROM books b JOIN highlights h ON h.book_id = b.id AND h.removed = 0
       GROUP BY b.id ORDER BY n DESC`,
    )
    .all() as Array<{ id: string; title: string; author: string | null; in_library: number; n: number }>;
  return rows.map((r) => ({ id: r.id, title: r.title, author: r.author, inLibrary: !!r.in_library, highlightCount: r.n }));
}

export async function listCategories(): Promise<CategoryDTO[]> {
  await connection();
  const rows = db()
    .prepare(
      `SELECT c.id, c.name, c.description, count(h.id) n
       FROM categories c
       LEFT JOIN highlight_categories hc ON hc.category_id = c.id
       LEFT JOIN highlights h ON h.id = hc.highlight_id AND h.removed = 0
       GROUP BY c.id ORDER BY n DESC, c.name`,
    )
    .all() as Array<{ id: number; name: string; description: string | null; n: number }>;
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, highlightCount: r.n }));
}

export async function listColors(): Promise<Record<string, number>> {
  await connection();
  const rows = db()
    .prepare("SELECT color, count(*) n FROM highlights WHERE removed = 0 GROUP BY color ORDER BY n DESC")
    .all() as Array<{ color: string; n: number }>;
  return Object.fromEntries(rows.map((r) => [r.color, r.n]));
}

export async function listHighlights(f: HighlightFilters = {}): Promise<{ total: number; items: HighlightDTO[] }> {
  await connection();
  const where: string[] = ["h.removed = 0"];
  const params: Array<string | number> = [];

  const fts = f.q ? ftsQuery(f.q) : null;
  if (fts) {
    where.push("h.rowid IN (SELECT rowid FROM highlights_fts WHERE highlights_fts MATCH ?)");
    params.push(fts);
  }
  if (f.bookId) (where.push("h.book_id = ?"), params.push(f.bookId));
  if (f.color) (where.push("h.color = ?"), params.push(f.color));
  if (f.favorite) where.push("h.favorite = 1");
  if (f.categoryId) {
    where.push("EXISTS (SELECT 1 FROM highlight_categories hc WHERE hc.highlight_id = h.id AND hc.category_id = ?)");
    params.push(f.categoryId);
  }
  if (f.uncategorized) where.push("NOT EXISTS (SELECT 1 FROM highlight_categories hc WHERE hc.highlight_id = h.id)");

  const order =
    f.sort === "newest"
      ? "h.created_at DESC"
      : f.sort === "oldest"
        ? "h.created_at ASC"
        : `${BOOK_TITLE} COLLATE NOCASE, h.sort_key`;
  const limit = Math.min(f.limit ?? 100, 500);
  const offset = f.offset ?? 0;
  const whereSql = where.join(" AND ");

  const d = db();
  const total = (
    d.prepare(`SELECT count(*) n FROM highlights h WHERE ${whereSql}`).get(...params) as { n: number }
  ).n;

  const rows = d
    .prepare(
      `SELECT h.id, h.text, h.note, h.color, h.chapter, h.created_at, h.favorite,
              b.id book_id, ${BOOK_TITLE} book_title, ${BOOK_AUTHOR} book_author,
              (SELECT json_group_array(json_object('id', c.id, 'name', c.name))
                 FROM highlight_categories hc JOIN categories c ON c.id = hc.category_id
                WHERE hc.highlight_id = h.id) cats
       FROM highlights h JOIN books b ON b.id = h.book_id
       WHERE ${whereSql}
       ORDER BY ${order}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Array<Record<string, string | number | null>>;

  return {
    total,
    items: rows.map((r) => ({
      id: r.id as string,
      text: r.text as string,
      note: r.note as string | null,
      color: r.color as HighlightDTO["color"],
      chapter: r.chapter as string | null,
      createdAt: r.created_at as string | null,
      favorite: r.favorite === 1,
      book: { id: r.book_id as string, title: r.book_title as string, author: r.book_author as string | null },
      categories: JSON.parse((r.cats as string) ?? "[]"),
    })),
  };
}

// ---- mutations (used by API routes) ----

export function setFavorite(id: string, favorite: boolean): boolean {
  return db().prepare("UPDATE highlights SET favorite = ? WHERE id = ?").run(favorite ? 1 : 0, id).changes > 0;
}

export function setHighlightCategories(id: string, categoryIds: number[]) {
  const d = db();
  d.prepare("DELETE FROM highlight_categories WHERE highlight_id = ?").run(id);
  const ins = d.prepare("INSERT OR IGNORE INTO highlight_categories (highlight_id, category_id) VALUES (?, ?)");
  for (const c of categoryIds) ins.run(id, c);
  d.prepare("UPDATE highlights SET categorized_at = COALESCE(categorized_at, ?) WHERE id = ?").run(new Date().toISOString(), id);
}

export function updateBook(id: string, patch: { title?: string | null; author?: string | null }): boolean {
  const d = db();
  let changed = false;
  if (patch.title !== undefined)
    changed = d.prepare("UPDATE books SET custom_title = ? WHERE id = ?").run(patch.title?.trim() || null, id).changes > 0 || changed;
  if (patch.author !== undefined)
    changed = d.prepare("UPDATE books SET custom_author = ? WHERE id = ?").run(patch.author?.trim() || null, id).changes > 0 || changed;
  return changed;
}
