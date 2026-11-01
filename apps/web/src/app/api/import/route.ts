import { importFromAppleBooks } from "@/lib/importer";
import { categorize, hasCredentials } from "@/lib/categorize";
import { tryLock, unlock } from "@/lib/lock";
import type { ImportEvent } from "@/lib/types";

/**
 * POST /api/import            → import from Apple Books, then AI-categorize new highlights
 * POST /api/import?rebuild=1  → same, but throw away categories and redesign them from scratch
 * Streams NDJSON ImportEvent lines so the UI can show progress.
 */
export async function POST(req: Request) {
  const rebuild = new URL(req.url).searchParams.get("rebuild") === "1";
  if (!tryLock()) return Response.json({ error: "An import is already running" }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ImportEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "stage", message: "Reading Apple Books library…" });
        const r = importFromAppleBooks();
        send({
          type: "stage",
          message: `Imported ${r.highlights} highlights from ${r.books} books (${r.added} new${r.removed ? `, ${r.removed} removed` : ""})`,
        });

        if (!hasCredentials()) {
          send({
            type: "warning",
            message: "Skipped AI categorization: add ANTHROPIC_API_KEY to apps/web/.env.local and restart the dev server.",
          });
        } else {
          const c = await categorize(
            { rebuild },
            {
              onStage: (message) => send({ type: "stage", message }),
              onProgress: (done, total) => send({ type: "progress", done, total }),
              onWarning: (message) => send({ type: "warning", message }),
            },
          );
          if (c.categorized) send({ type: "stage", message: `Categorized ${c.categorized} highlights` });
        }
        send({ type: "done", message: "Import complete" });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        unlock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
