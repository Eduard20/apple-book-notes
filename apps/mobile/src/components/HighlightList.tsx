import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { listHighlights, toggleFavorite } from "@/lib/db";
import { bumpData, useDataVersion } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import type { Filters, Highlight } from "@/lib/types";
import { HighlightCard } from "./HighlightCard";
import { EmptyState, PageHeading } from "./ReadingUI";

const PAGE = 60;

export function HighlightList({ filters, searchable = true, empty, title = "Your highlights", subtitle = "Good words, worth coming back to.", eyebrow = "BOOK NOTES" }: { filters: Filters; searchable?: boolean; empty?: React.ReactElement; title?: string; subtitle?: string; eyebrow?: string }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Highlight[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadedSelection, setLoadedSelection] = useState<string | null>(null);
  const windowSize = useRef(PAGE);
  const previousSelection = useRef("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const loadingMore = useRef(false);
  const generation = useRef(0);
  const favoriteBusy = useRef(new Set<string>());

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 200);
    return () => clearTimeout(id);
  }, [q]);

  const key = JSON.stringify(filters);
  const selectionKey = `${key}|${debouncedQ}`;
  const queryKey = `${selectionKey}|${version}|${retry}`;
  const loading = loadedFor !== queryKey;
  useEffect(() => {
    const request = ++generation.current;
    loadingMore.current = false;
    if (previousSelection.current !== selectionKey) windowSize.current = PAGE;
    previousSelection.current = selectionKey;
    const limit = windowSize.current;
    listHighlights(db, { ...JSON.parse(key), q: debouncedQ || undefined }, limit, 0).then((rows) => {
      if (request !== generation.current) return;
      setMoreBusy(false);
      setError(null);
      setItems(rows);
      setDone(rows.length < limit);
      setLoadedSelection(selectionKey);
      setLoadedFor(queryKey);
    }).catch(() => {
      if (request !== generation.current) return;
      setMoreBusy(false);
      setItems([]);
      setLoadedSelection(selectionKey);
      setError("Your highlights couldn't be loaded. Your saved library is still on this phone.");
      setLoadedFor(queryKey);
    });
    return () => { generation.current = request + 1; };
  }, [db, key, debouncedQ, queryKey, selectionKey]);

  const loadMore = useCallback(async () => {
    if (loading || done || error || loadingMore.current) return;
    const request = generation.current;
    loadingMore.current = true;
    setMoreBusy(true);
    try {
      const rows = await listHighlights(db, { ...JSON.parse(key), q: debouncedQ || undefined }, PAGE, items.length);
      if (request !== generation.current) return;
      windowSize.current = items.length + rows.length;
      setItems((prev) => [...prev, ...rows]);
      setDone(rows.length < PAGE);
    } catch {
      if (request === generation.current) setError("Couldn't load more highlights. Please try again.");
    } finally {
      if (request === generation.current) { loadingMore.current = false; setMoreBusy(false); }
    }
  }, [db, key, debouncedQ, items.length, done, loading, error]);

  const onToggleFavorite = useCallback(async (h: Highlight) => {
    if (favoriteBusy.current.has(h.id)) return;
    favoriteBusy.current.add(h.id);
    try {
      await toggleFavorite(db, h.id, !h.favorite);
      // Refresh counts and favorites everywhere, not just the current list.
      bumpData();
    } catch { Alert.alert("Couldn't update favorite", "Please try again. Your highlight hasn't changed."); }
    finally { favoriteBusy.current.delete(h.id); }
  }, [db]);

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      data={loadedSelection === selectionKey ? items : []}
      keyExtractor={(h) => h.id}
      renderItem={({ item }) => <HighlightCard h={item} showBook={!filters.bookId} onToggleFavorite={onToggleFavorite} />}
      ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={<>
        <PageHeading eyebrow={eyebrow} title={title} subtitle={subtitle} />
        {searchable ? <View style={[styles.searchRow, { backgroundColor: t.card, borderColor: t.border }]}>
          <Text accessible={false} style={{ color: t.muted, fontSize: 24 }}>⌕</Text>
          <TextInput accessibilityLabel="Search highlights" value={q} onChangeText={setQ} placeholder="Find a thought…" placeholderTextColor={t.muted} autoCorrect={false} returnKeyType="search" style={[styles.search, { color: t.text }]} />
          {q ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ("")} style={styles.clear}><Text style={{ color: t.muted, fontSize: 18 }}>×</Text></Pressable> : null}
        </View> : null}
        {loadedSelection === selectionKey && items.length > 0 ? <Text style={[styles.count, { color: t.muted }]}>{debouncedQ ? "SEARCH RESULTS" : "SAVED HIGHLIGHTS"} · {items.length}{!done ? "+" : ""}</Text> : null}
      </>}
      ListEmptyComponent={loading ? <EmptyState loading title="Opening your notes" detail="A moment for your reading." /> : error ? <EmptyState title="Let's try that again" detail={error} action="Try again" onPress={() => setRetry(r => r + 1)} /> : debouncedQ ? <EmptyState title="No matching words" detail={`Nothing matches “${debouncedQ}”. Try another word or clear your search.`} action="Clear search" onPress={() => setQ("")} /> : (empty ?? <EmptyState title="A little quiet here" detail="Highlights saved to this collection will appear here." />)}
      ListFooterComponent={!loading && moreBusy ? <ActivityIndicator color={t.accent} style={{ margin: 24 }} /> : error && items.length > 0 ? <EmptyState title="Couldn't load more" detail={error} action="Try again" onPress={() => setRetry(r => r + 1)} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, paddingLeft: 16, marginBottom: 22 },
  search: { flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 12, paddingRight: 12, fontSize: 16 },
  clear: { width: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 14 },
});
