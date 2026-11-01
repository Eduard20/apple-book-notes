# Book Notes

Your Apple Books highlights, imported locally and auto-categorized by Claude.

## Run

```sh
npm install
cp apps/web/.env.example apps/web/.env.local   # add ANTHROPIC_API_KEY for categorization
npm run dev                                     # prints the URL (random free port; set PORT to pin one)
```

Then click **Import from Apple Books**. Your terminal needs Full Disk Access (System Settings → Privacy & Security).

## Layout

- `packages/extractor`: reads Apple Books' SQLite DBs (read-only snapshot). `npm run extract` dumps JSON.
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
