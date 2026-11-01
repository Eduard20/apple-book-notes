import { z } from "zod";
import { after } from "next/server";
import { ingestShared } from "@/lib/ingest";
import { categorize, hasCredentials } from "@/lib/categorize";
import { tryLock, unlock } from "@/lib/lock";

const Body = z.object({
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        note: z.string().nullish(),
        bookTitle: z.string(),
        author: z.string().nullish(),
        sharedAt: z.string().nullish(),
      }),
    )
    .max(5000),
});

/**
 * POST /api/ingest  { items: SharedHighlight[] }
 * Highlights shared from Apple Books on the phone. New ones are AI-categorized in the background.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });

  const result = ingestShared(body.data.items);

  let categorizing = false;
  if (result.added && hasCredentials() && tryLock()) {
    categorizing = true;
    after(async () => {
      try {
        await categorize({}, { onStage() {}, onProgress() {}, onWarning: (m) => console.warn("[ingest]", m) });
      } catch (e) {
        console.error("[ingest] categorize failed:", e);
      } finally {
        unlock();
      }
    });
  }
  return Response.json({ ...result, categorizing });
}
