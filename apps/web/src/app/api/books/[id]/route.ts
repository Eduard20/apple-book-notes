import { z } from "zod";
import { updateBook } from "@/lib/queries";

const Patch = z.object({ title: z.string().nullable().optional(), author: z.string().nullable().optional() });

/** PATCH /api/books/:id  { title?, author? } — null resets to the Apple Books value */
export async function PATCH(req: Request, ctx: RouteContext<"/api/books/[id]">) {
  const { id } = await ctx.params;
  const body = Patch.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.message }, { status: 400 });
  if (!updateBook(id, body.data)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
