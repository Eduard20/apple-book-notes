import { z } from "zod";
import { setFavorite, setHighlightCategories } from "@/lib/queries";

const Patch = z.object({
  favorite: z.boolean().optional(),
  categoryIds: z.array(z.number().int()).optional(),
});

/** PATCH /api/highlights/:id  { favorite?: boolean, categoryIds?: number[] } */
export async function PATCH(req: Request, ctx: RouteContext<"/api/highlights/[id]">) {
  const { id } = await ctx.params;
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  if (body.data.favorite !== undefined && !setFavorite(id, body.data.favorite))
    return Response.json({ error: "Not found" }, { status: 404 });
  if (body.data.categoryIds) setHighlightCategories(id, body.data.categoryIds);
  return Response.json({ ok: true });
}
