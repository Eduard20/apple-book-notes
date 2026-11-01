// API shapes are shared with the Mac app (type-only import, erased at build time).
import type { HighlightColor } from "../../../web/src/lib/types";

export type { ExportPayload, HighlightColor } from "../../../web/src/lib/types";

export interface Highlight {
  id: string;
  text: string;
  note: string | null;
  color: HighlightColor;
  chapter: string | null;
  createdAt: string | null;
  favorite: boolean;
  pending: boolean; // shared on the phone, not yet sent to the Mac
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  categories: { id: number; name: string }[];
}

export interface Filters {
  q?: string;
  bookId?: string;
  categoryId?: number;
  color?: HighlightColor;
  favorite?: boolean;
}

export const COLOR_SWATCH: Record<HighlightColor, string> = {
  yellow: "#facc15",
  green: "#4ade80",
  blue: "#60a5fa",
  pink: "#f472b6",
  purple: "#c084fc",
  underline: "#ef4444",
  unknown: "#a3a3a3",
};
