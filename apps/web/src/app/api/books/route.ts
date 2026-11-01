import { listBooks } from "@/lib/queries";

export async function GET() {
  return Response.json(await listBooks());
}
