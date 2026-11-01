import { connection } from "next/server";
import { db, getMeta } from "@/lib/db";

/**
 * GET /api/export: the whole library in one payload, for the phone to store offline.
 * Shape: see ExportPayload in lib/types.ts
 */
export async function GET() {
  await connection();
  const d = db();
  const books = d
    .prepare(
      `SELECT b.id, COALESCE(b.custom_title, b.title) title, COALESCE(b.custom_author, b.author) author, b.in_library inLibrary
       FROM books b WHERE EXISTS (SELECT 1 FROM highlights h WHERE h.book_id = b.id AND h.removed = 0)`,
    )
    .all();
  const categories = d.prepare("SELECT id, name, description FROM categories ORDER BY name").all();
  const highlights = d
    .prepare(
      `SELECT h.id, h.book_id bookId, h.text, h.note, h.color, h.chapter, h.sort_key sortKey,
              h.created_at createdAt, h.favorite,
              (SELECT json_group_array(category_id) FROM highlight_categories WHERE highlight_id = h.id) categoryIds
       FROM highlights h WHERE h.removed = 0`,
    )
    .all() as Array<Record<string, unknown>>;

  return Response.json({
    exportedAt: new Date().toISOString(),
    lastImportAt: getMeta("last_import_at"),
    books: books.map((b) => ({ ...b, inLibrary: b.inLibrary === 1 })),
    categories,
    highlights: highlights.map((h) => ({ ...h, favorite: h.favorite === 1, categoryIds: JSON.parse(h.categoryIds as string) })),
  });
}
