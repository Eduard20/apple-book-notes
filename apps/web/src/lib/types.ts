// Shared API shapes. Kept free of server imports so a future React Native app can copy/reuse them.

export type HighlightColor = "underline" | "green" | "blue" | "yellow" | "pink" | "purple" | "unknown";

export interface BookDTO {
  id: string;
  title: string;
  author: string | null;
  inLibrary: boolean;
  highlightCount: number;
}

export interface CategoryDTO {
  id: number;
  name: string;
  description: string | null;
  highlightCount: number;
}

export interface HighlightDTO {
  id: string;
  text: string;
  note: string | null;
  color: HighlightColor;
  chapter: string | null;
  createdAt: string | null;
  favorite: boolean;
  book: { id: string; title: string; author: string | null };
  categories: { id: number; name: string }[];
}

export interface HighlightFilters {
  q?: string;
  bookId?: string;
  categoryId?: number;
  color?: HighlightColor;
  favorite?: boolean;
  uncategorized?: boolean;
  sort?: "book" | "newest" | "oldest";
  limit?: number;
  offset?: number;
}

export interface Stats {
  highlights: number;
  books: number;
  categories: number;
  uncategorized: number;
  favorites: number;
  lastImportAt: string | null;
}

/** NDJSON events streamed by POST /api/import */
export type ImportEvent =
  | { type: "stage"; message: string }
  | { type: "progress"; done: number; total: number }
  | { type: "warning"; message: string }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

export const COLOR_SWATCH: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
  pink: "#f472b6",
  purple: "#c084fc",
  underline: "#ef4444",
  unknown: "#a3a3a3",
};

/** GET /api/export: full snapshot for offline clients (the iOS app). */
export interface ExportPayload {
  exportedAt: string;
  lastImportAt: string | null;
  books: { id: string; title: string; author: string | null; inLibrary: boolean }[];
  categories: { id: number; name: string; description: string | null }[];
  highlights: {
    id: string;
    bookId: string;
    text: string;
    note: string | null;
    color: HighlightColor;
    chapter: string | null;
    sortKey: number;
    createdAt: string | null;
    favorite: boolean;
    categoryIds: number[];
  }[];
}
