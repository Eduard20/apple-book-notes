import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { listHighlights, toggleFavorite } from "@/lib/db";
import { bumpData, useDataVersion } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { Filters, Highlight } from "@/lib/types";
import { HighlightCard } from "./HighlightCard";

const PAGE = 60;

export function HighlightList({ filters, searchable = true, empty }: { filters: Filters; searchable?: boolean; empty?: React.ReactElement }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Highlight[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const loadingMore = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(id);
  }, [q]);

  const key = JSON.stringify(filters);
  const queryKey = `${key}|${debouncedQ}|${version}`;
  const loading = loadedFor !== queryKey;
  useEffect(() => {
    let cancelled = false;
    listHighlights(db, { ...filters, q: debouncedQ || undefined }, PAGE, 0).then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setDone(rows.length < PAGE);
      setLoadedFor(queryKey);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, queryKey]);

  const loadMore = useCallback(async () => {
    if (done || loadingMore.current) return;
    loadingMore.current = true;
    const rows = await listHighlights(db, { ...filters, q: debouncedQ || undefined }, PAGE, items.length);
    setItems((prev) => [...prev, ...rows]);
    setDone(rows.length < PAGE);
    loadingMore.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key, debouncedQ, items.length, done]);

  const onToggleFavorite = useCallback(
    async (h: Highlight) => {
      setItems((prev) => prev.map((x) => (x.id === h.id ? { ...x, favorite: !x.favorite } : x)));
      await toggleFavorite(db, h.id, !h.favorite);
      if (filters.favorite) bumpData();
    },
    [db, filters.favorite],
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      data={loading && items.length === 0 ? [] : items}
      keyExtractor={(h) => h.id}
      renderItem={({ item }) => <HighlightCard h={item} showBook={!filters.bookId} onToggleFavorite={onToggleFavorite} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        searchable ? (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search highlights"
            placeholderTextColor={t.muted}
            clearButtonMode="while-editing"
            autoCorrect={false}
            style={[styles.search, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
          />
        ) : undefined
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : debouncedQ ? (
          <Text style={[styles.empty, { color: t.muted }]}>Nothing matches “{debouncedQ}”</Text>
        ) : (
          (empty ?? <Text style={[styles.empty, { color: t.muted }]}>No highlights</Text>)
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  search: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, marginBottom: 14 },
  empty: { textAlign: "center", marginTop: 40, fontSize: 15, paddingHorizontal: 24, lineHeight: 22 },
});
