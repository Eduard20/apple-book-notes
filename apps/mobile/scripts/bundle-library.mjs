// Snapshot the Mac library (data/notes.db) into src/data/library.json so it ships inside the app.
// Same shape as GET /api/export (ExportPayload in apps/web/src/lib/types.ts). Keep the two in sync.
// Usage: node scripts/bundle-library.mjs [--empty]
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../src/data/library.json");
const DB = resolve(process.env.DB_PATH ?? resolve(import.meta.dirname, "../../../data/notes.db"));
const empty = { exportedAt: null, lastImportAt: null, books: [], categories: [], highlights: [] };

mkdirSync(dirname(OUT), { recursive: true });

if (process.argv.includes("--empty")) {
  // Placeholder so a fresh checkout typechecks/bundles. Never overwrites a real snapshot.
  if (!existsSync(OUT)) writeFileSync(OUT, JSON.stringify(empty));
  process.exit(0);
}

if (!existsSync(DB)) {
  console.error(`✗ ${DB} not found. Run the Mac app and click "Import from Apple Books" first.`);
  process.exit(1);
}

const d = new DatabaseSync(DB, { readOnly: true });
const meta = d.prepare("SELECT value FROM meta WHERE key = 'last_import_at'").get();
const books = d
  .prepare(
    `SELECT b.id, COALESCE(b.custom_title, b.title) title, COALESCE(b.custom_author, b.author) author, b.in_library inLibrary
     FROM books b WHERE EXISTS (SELECT 1 FROM highlights h WHERE h.book_id = b.id AND h.removed = 0)`,
  )
  .all()
  .map((b) => ({ ...b, inLibrary: b.inLibrary === 1 }));
const categories = d.prepare("SELECT id, name, description FROM categories ORDER BY name").all();
const highlights = d
  .prepare(
    `SELECT h.id, h.book_id bookId, h.text, h.note, h.color, h.chapter, h.sort_key sortKey,
            h.created_at createdAt, h.favorite,
            (SELECT json_group_array(category_id) FROM highlight_categories WHERE highlight_id = h.id) categoryIds
     FROM highlights h WHERE h.removed = 0`,
  )
  .all()
  .map((h) => ({ ...h, favorite: h.favorite === 1, categoryIds: JSON.parse(h.categoryIds) }));
d.close();

const snapshot = { exportedAt: new Date().toISOString(), lastImportAt: meta?.value ?? null, books, categories, highlights };
writeFileSync(OUT, JSON.stringify(snapshot));
console.log(`✓ Bundled ${highlights.length} highlights, ${books.length} books, ${categories.length} categories into the app`);
