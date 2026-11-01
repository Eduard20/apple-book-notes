import type { SQLiteDatabase } from "expo-sqlite";
import { getMeta, replaceWithSnapshot, setMeta } from "./db";
import type { ExportPayload } from "./types";

export const serverUrl = (address: string) => {
  const a = address.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(a) ? a : `http://${a}`;
};

async function request(base: string, path: string, init?: RequestInit, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Mac didn't answer. Is the Book Notes app running and on the same Wi-Fi?");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export interface SyncResult {
  uploaded: number;
  duplicates: number;
  highlights: number;
  categorizing: boolean;
}

/**
 * 1. Send highlights shared on the phone (Mac de-dupes + AI-categorizes them)
 * 2. Send favorite changes
 * 3. Download the full library and replace the local copy
 */
export async function sync(db: SQLiteDatabase): Promise<SyncResult> {
  const address = await getMeta(db, "server");
  if (!address) throw new Error("Set your Mac's address first (shown at the top of the Book Notes web page).");
  const base = serverUrl(address);

  // 1. outbox: shared highlights
  const shared = await db.getAllAsync<{ local_id: number; text: string; note: string | null; book_title: string; author: string | null; shared_at: string }>(
    "SELECT * FROM pending_shared ORDER BY local_id",
  );
  let uploaded = 0;
  let duplicates = 0;
  let categorizing = false;
  if (shared.length) {
    const res = await request(base, "/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: shared.map((s) => ({ text: s.text, note: s.note, bookTitle: s.book_title, author: s.author, sharedAt: s.shared_at })),
      }),
    });
    const r = (await res.json()) as { added: number; duplicates: number; categorizing: boolean };
    uploaded = r.added;
    duplicates = r.duplicates;
    categorizing = r.categorizing;
    const maxId = shared[shared.length - 1].local_id;
    await db.withTransactionAsync(async () => {
      // Favorites set on phone-only highlights: remember by text so we can re-apply after the snapshot.
      await db.runAsync(
        "INSERT OR REPLACE INTO meta (key, value) SELECT 'fav:' || text, '1' FROM highlights WHERE id LIKE 'local:%' AND favorite = 1",
      );
      await db.runAsync("DELETE FROM pending_shared WHERE local_id <= ?", maxId);
      await db.runAsync(
        "DELETE FROM highlights WHERE pending = 1 AND CAST(substr(id, 7) AS INTEGER) <= ?",
        maxId,
      );
    });
  }

  // 2. outbox: favorites
  const favs = await db.getAllAsync<{ highlight_id: string; favorite: number }>("SELECT * FROM pending_favorites");
  for (const f of favs) {
    try {
      await request(base, `/api/highlights/${encodeURIComponent(f.highlight_id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: f.favorite === 1 }),
      });
      await db.runAsync("DELETE FROM pending_favorites WHERE highlight_id = ? AND favorite = ?", f.highlight_id, f.favorite);
    } catch (e) {
      if (String(e).includes("HTTP 404")) await db.runAsync("DELETE FROM pending_favorites WHERE highlight_id = ?", f.highlight_id);
      else throw e;
    }
  }

  // 3. download
  const snapshot = (await (await request(base, "/api/export", undefined, 60000)).json()) as ExportPayload;
  await replaceWithSnapshot(db, snapshot);

  // Re-apply favorites made on phone-only highlights before they reached the Mac.
  const favTexts = await db.getAllAsync<{ key: string }>("SELECT key FROM meta WHERE key LIKE 'fav:%'");
  for (const { key } of favTexts) {
    const text = key.slice(4);
    const row = await db.getFirstAsync<{ id: string }>("SELECT id FROM highlights WHERE text = ? AND favorite = 0", text);
    if (row) {
      await db.runAsync("UPDATE highlights SET favorite = 1 WHERE id = ?", row.id);
      await db.runAsync("INSERT OR REPLACE INTO pending_favorites (highlight_id, favorite) VALUES (?, 1)", row.id);
    }
    await db.runAsync("DELETE FROM meta WHERE key = ?", key);
  }

  await setMeta(db, "last_sync", new Date().toISOString());
  await setMeta(db, "library_at", snapshot.exportedAt);
  return { uploaded, duplicates, highlights: snapshot.highlights.length, categorizing };
}
