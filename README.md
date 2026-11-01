# Book Notes

Your Apple Books highlights, imported locally and auto-categorized by Claude.

## Run

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # add ANTHROPIC_API_KEY for categorization
npm run dev                                     # prints the URL (random free port; set PORT to pin one)
```

Then click **Import from Apple Books**. Your terminal needs Full Disk Access (System Settings → Privacy & Security).

## iPhone app (`apps/mobile`)

Expo / React Native. Keeps a full offline copy of your library and syncs with the Mac over Wi-Fi.

- **Sync tab:** enter the "iPhone sync address" shown at the top of the web page, then tap Sync now. Phone highlights reach the Mac through iCloud anyway, so this one sync brings you everything.
- **Share from Apple Books:** in a book open Notes, select highlights, tap Share, then Book Notes. Or tap Copy, then use **Paste from Apple Books** on the Sync tab. They're sent to the Mac on the next sync, de-duplicated, and AI-categorized.

Install / update (free Apple ID works, but the app needs reinstalling every 7 days):

```sh
cd apps/mobile && npm install
npm run ios:install         # bundles data/notes.db into the app, builds Release, installs over USB
```

The library ships inside the app (`src/data/library.json`, gitignored), so no Wi-Fi sync is needed: import on the Mac, then re-run `ios:install`. The phone keeps favorites and shared highlights across reinstalls.

## Layout

- `packages/extractor`: reads Apple Books' SQLite DBs (read-only snapshot). `npm run extract` dumps JSON.
- `apps/mobile`: iOS app (Expo).
- `apps/web`: Next.js app plus a JSON API. Data is stored in `data/notes.db` (SQLite, gitignored).

## API (for the future mobile app)

| Method | Path | |
|---|---|---|
| POST | `/api/import[?rebuild=1]` | import + categorize, streams NDJSON progress |
| GET | `/api/highlights?q=&book=&category=&color=&favorite=1&uncategorized=1&sort=book\|newest\|oldest&limit=&offset=` | |
| PATCH | `/api/highlights/:id` | `{ favorite?, categoryIds? }` |
| GET | `/api/books` · `/api/categories` · `/api/stats` | |
| PATCH | `/api/books/:id` | `{ title?, author? }` (null resets) |

Shared types: `apps/web/src/lib/types.ts`.

## Re-importing

Safe to run any time. Highlights upsert by Apple's IDs, so your favorites, categories and renamed books are kept. Only new highlights get sent to Claude. Highlights deleted in Apple Books are hidden, not destroyed.
