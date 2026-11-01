import { listHighlights } from "@/lib/queries";
import { parseFilters } from "@/lib/filters";

/** GET /api/highlights?q=&book=&category=&color=&favorite=1&uncategorized=1&sort=&limit=&offset= */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return Response.json(await listHighlights(parseFilters(Object.fromEntries(sp))));
}
