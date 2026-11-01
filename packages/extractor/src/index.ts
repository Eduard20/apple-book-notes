/**
 * Apple Books highlight extractor (Milestone 0).
 *
 * Reads the local Apple Books SQLite databases (read-only, from a temp copy so
 * we never touch the live files) and writes a normalized JSON export.
 *
 * Usage: node src/index.ts [--out path/to/export.json]
 * Requires: macOS, Node >= 24, Full Disk Access for the terminal.
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const BOOKS_DIR = join(homedir(), "Library/Containers/com.apple.iBooksX/Data/Documents");
const ANNOTATION_DIR = join(BOOKS_DIR, "AEAnnotation");
const LIBRARY_DIR = join(BOOKS_DIR, "BKLibrary");

/** Core Data stores dates as seconds since 2001-01-01 UTC. */
const CORE_DATA_EPOCH_OFFSET = 978_307_200;

/** ZANNOTATIONSTYLE → highlight color as shown in Apple Books. */
const STYLE_COLORS: Record<number, HighlightColor> = {
  0: "underline",
  1: "green",
  2: "blue",
  3: "yellow",
  4: "pink",
  5: "purple",
};

/** ZANNOTATIONTYPE 2 = highlight. (1 = reading position, 3 = bookmark.) */
const TYPE_HIGHLIGHT = 2;

export type HighlightColor = "underline" | "green" | "blue" | "yellow" | "pink" | "purple" | "unknown";

export interface Book {
  id: string; // Apple asset ID
  title: string;
  author: string | null;
  genre: string | null;
  inLibrary: boolean; // false = book was removed from Apple Books, highlights remain
  highlightCount: number;
}

export interface Highlight {
  id: string; // Apple annotation UUID — stable across syncs, use as upsert key
  bookId: string;
  text: string;
  note: string | null;
  color: HighlightColor;
  isUnderline: boolean;
  chapter: string | null;
  context: string | null; // surrounding sentence Apple stores ("representative text")
  location: string | null; // epubcfi
  sortKey: number; // order within the book
  createdAt: string | null; // ISO
  modifiedAt: string | null; // ISO
}

export interface Export {
  exportedAt: string;
  books: Book[];
  highlights: Highlight[];
}

function findSqlite(dir: string): string {
  if (!existsSync(dir)) throw new Error(`Not found: ${dir} (is Apple Books installed?)`);
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    throw new Error(`Cannot read ${dir}. Grant your terminal Full Disk Access in System Settings → Privacy & Security.`);
  }
  const db = files.find((f) => f.endsWith(".sqlite"));
  if (!db) throw new Error(`No .sqlite file in ${dir}`);
  return join(dir, db);
}

/** Copy db + WAL/SHM sidecars to a temp dir so reads include unflushed changes and never lock the live file. */
function snapshot(dbPath: string, tmp: string): string {
  const target = join(tmp, dbPath.split("/").pop()!);
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(dbPath + suffix)) copyFileSync(dbPath + suffix, target + suffix);
  }
  return target;
}

const toIso = (v: unknown): string | null =>
  typeof v === "number" ? new Date((v + CORE_DATA_EPOCH_OFFSET) * 1000).toISOString() : null;

const clean = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
};

export function extract(): Export {
  const tmp = mkdtempSync(join(tmpdir(), "abn-"));
  try {
    const annDb = new DatabaseSync(snapshot(findSqlite(ANNOTATION_DIR), tmp));
    const libDb = new DatabaseSync(snapshot(findSqlite(LIBRARY_DIR), tmp));

    const libRows = libDb
      .prepare("SELECT ZASSETID, ZTITLE, ZAUTHOR, ZGENRE FROM ZBKLIBRARYASSET WHERE ZASSETID IS NOT NULL")
      .all() as Array<Record<string, unknown>>;
    const library = new Map(libRows.map((r) => [r.ZASSETID as string, r]));

    const rows = annDb
      .prepare(
        `SELECT ZANNOTATIONUUID, ZANNOTATIONASSETID, ZANNOTATIONSELECTEDTEXT, ZANNOTATIONNOTE,
                ZANNOTATIONSTYLE, ZANNOTATIONISUNDERLINE, ZFUTUREPROOFING5, ZANNOTATIONREPRESENTATIVETEXT,
                ZANNOTATIONLOCATION, ZPLLOCATIONRANGESTART, ZANNOTATIONCREATIONDATE, ZANNOTATIONMODIFICATIONDATE
         FROM ZAEANNOTATION
         WHERE ZANNOTATIONDELETED = 0
           AND ZANNOTATIONTYPE = ?
           AND ZANNOTATIONSELECTEDTEXT IS NOT NULL AND length(trim(ZANNOTATIONSELECTEDTEXT)) > 0`,
      )
      .all(TYPE_HIGHLIGHT) as Array<Record<string, unknown>>;

    annDb.close();
    libDb.close();

    const highlights: Highlight[] = rows.map((r) => {
      const text = clean(r.ZANNOTATIONSELECTEDTEXT)!;
      const context = clean(r.ZANNOTATIONREPRESENTATIVETEXT);
      return {
        id: r.ZANNOTATIONUUID as string,
        bookId: r.ZANNOTATIONASSETID as string,
        text,
        note: clean(r.ZANNOTATIONNOTE),
        color: STYLE_COLORS[r.ZANNOTATIONSTYLE as number] ?? "unknown",
        isUnderline: r.ZANNOTATIONISUNDERLINE === 1,
        chapter: clean(r.ZFUTUREPROOFING5),
        context: context && context !== text ? context : null,
        location: (r.ZANNOTATIONLOCATION as string) ?? null,
        sortKey: 0,
        createdAt: toIso(r.ZANNOTATIONCREATIONDATE),
        modifiedAt: toIso(r.ZANNOTATIONMODIFICATIONDATE),
      };
    });

    // Order within each book: spine position first, then the CFI path (numeric-aware).
    const rangeStart = new Map(rows.map((r) => [r.ZANNOTATIONUUID as string, (r.ZPLLOCATIONRANGESTART as number) ?? 0]));
    const collator = new Intl.Collator(undefined, { numeric: true });
    highlights.sort(
      (a, b) =>
        a.bookId.localeCompare(b.bookId) ||
        rangeStart.get(a.id)! - rangeStart.get(b.id)! ||
        collator.compare(a.location ?? "", b.location ?? ""),
    );
    const counters = new Map<string, number>();
    for (const h of highlights) {
      const n = counters.get(h.bookId) ?? 0;
      h.sortKey = n;
      counters.set(h.bookId, n + 1);
    }

    const books: Book[] = [...counters.entries()].map(([id, count]) => {
      const lib = library.get(id);
      return {
        id,
        title: clean(lib?.ZTITLE) ?? `Unknown book (${id.slice(0, 6)})`,
        author: clean(lib?.ZAUTHOR),
        genre: clean(lib?.ZGENRE),
        inLibrary: !!lib,
        highlightCount: count,
      };
    });
    books.sort((a, b) => b.highlightCount - a.highlightCount);

    return { exportedAt: new Date().toISOString(), books, highlights };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const outIdx = process.argv.indexOf("--out");
  const out = resolve(outIdx > -1 ? process.argv[outIdx + 1] : join(import.meta.dirname, "../../../data/export.json"));
  try {
    const data = extract();
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(data, null, 2));
    const missing = data.books.filter((b) => !b.inLibrary).length;
    console.log(`✓ ${data.highlights.length} highlights from ${data.books.length} books → ${out}`);
    if (missing) console.log(`  ${missing} books no longer in your library (titles unknown)`);
    const byColor = Object.groupBy(data.highlights, (h) => h.color);
    console.log("  colors:", Object.fromEntries(Object.entries(byColor).map(([k, v]) => [k, v!.length])));
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    process.exit(1);
  }
}
