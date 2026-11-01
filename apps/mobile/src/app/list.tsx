import { Stack, useLocalSearchParams } from "expo-router";
import { HighlightList } from "@/components/HighlightList";
import type { Filters, HighlightColor } from "@/lib/types";

export default function FilteredList() {
  const p = useLocalSearchParams<{ book?: string; category?: string; color?: string; favorite?: string; title?: string }>();
  const filters: Filters = {
    bookId: p.book,
    categoryId: p.category ? Number(p.category) : undefined,
    color: p.color as HighlightColor | undefined,
    favorite: p.favorite === "1",
  };
  return (
    <>
      <Stack.Screen options={{ title: p.title ?? "Highlights" }} />
      <HighlightList filters={filters} />
    </>
  );
}
