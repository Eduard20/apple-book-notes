import type { HighlightColor, HighlightFilters } from "./types";

const COLORS = new Set(["yellow", "green", "blue", "pink", "purple", "underline"]);

/** Shared by the page (searchParams) and GET /api/highlights. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): HighlightFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  const num = (k: string) => {
    const n = Number(get(k));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const color = get("color");
  const sort = get("sort");
  return {
    q: get("q"),
    bookId: get("book"),
    categoryId: num("category"),
    color: color && COLORS.has(color) ? (color as HighlightColor) : undefined,
    favorite: get("favorite") === "1",
    uncategorized: get("uncategorized") === "1",
    sort: sort === "newest" || sort === "oldest" ? sort : "book",
    limit: num("limit"),
    offset: num("offset"),
  };
}
