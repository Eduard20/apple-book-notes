import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { counts, listBooks, listCategories, listColors } from "@/lib/db";
import { useDataVersion } from "@/lib/store";
import { serif, useTheme } from "@/lib/theme";
import { COLOR_SWATCH, type HighlightColor } from "@/lib/types";
import { EmptyState, PageHeading } from "@/components/ReadingUI";

type Data = { categories: Awaited<ReturnType<typeof listCategories>>; books: Awaited<ReturnType<typeof listBooks>>; colors: Awaited<ReturnType<typeof listColors>>; favorites: number; highlights: number; };
const covers = ["#355E46", "#8C6545", "#586B80", "#7C5866", "#777342"];

export default function Browse() {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([listCategories(db), listBooks(db), listColors(db), counts(db)]).then(([categories, books, colors, c]) => {
      if (active) { setData({ categories, books, colors, favorites: c.favorites, highlights: c.highlights }); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [db, version, retry]);
  const open = (params: Record<string, string>) => router.push({ pathname: "/list", params });
  return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
    <PageHeading eyebrow="YOUR PERSONAL SHELF" title="A library of ideas" subtitle={data ? `${data.books.length} ${data.books.length === 1 ? "book" : "books"} · ${data.highlights} highlights to revisit` : "Collected from the books you love."} />
    {failed ? <EmptyState title="Couldn't open your library" detail="Your saved notes haven't changed. Try loading them again." action="Try again" onPress={() => { setFailed(false); setRetry(r => r + 1); }} /> : !data ? <EmptyState loading title="Finding your books" /> : <>
      <Pressable accessibilityRole="button" onPress={() => open({ favorite: "1", title: "Favorites" })} style={({ pressed }) => [styles.favorites, { backgroundColor: t.softAccent, opacity: pressed ? 0.75 : 1 }]}>
        <Text accessible={false} style={{ color: t.accent, fontSize: 27 }}>☆</Text>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: t.text, fontWeight: "600", fontSize: 17 }}>Your favorites</Text><Text style={{ color: t.muted, fontSize: 13 }}>The words you keep close</Text></View>
        <Text style={{ color: t.accent, fontWeight: "600", fontSize: 16 }}>{data.favorites}  ›</Text>
      </Pressable>
      <Header title="On your shelf" count={data.books.length} />
      {data.books.length === 0 ? <EmptyState title="Every idea starts with a book" detail="Add highlights from Apple Books to start your personal shelf." action="Add highlights" onPress={() => router.navigate("/sync")} /> : data.books.map((b, i) => <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${b.title}${b.author ? ` by ${b.author}` : ""}, ${b.n} highlights`} onPress={() => open({ book: b.id, title: b.title, author: b.author ?? "" })} style={({ pressed }) => [styles.bookRow, { backgroundColor: pressed ? t.chip : t.card, borderColor: t.border }]}>
        <View accessible={false} style={[styles.cover, { backgroundColor: covers[i % covers.length] }]}><View style={styles.spine} /><Text style={styles.coverLetter}>{b.title.trim().slice(0, 1).toUpperCase()}</Text><View style={styles.coverRule} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={[styles.bookTitle, { color: t.text }]} numberOfLines={3}>{b.title}</Text>{b.author ? <Text style={{ color: t.muted, fontSize: 13, lineHeight: 19 }} numberOfLines={2}>{b.author}</Text> : null}<Text style={{ color: t.accent, fontSize: 12, marginTop: 4 }}>{b.n} {b.n === 1 ? "highlight" : "highlights"}</Text></View>
        <Text accessible={false} style={{ color: t.muted, fontSize: 24 }}>›</Text>
      </Pressable>)}
      {data.colors.length > 0 ? <><Header title="By highlight color" /><View style={styles.colors}>{data.colors.map(c => <Pressable key={c.color} accessibilityRole="button" accessibilityLabel={`${c.color}, ${c.n} highlights`} onPress={() => open({ color: c.color, title: `${c.color[0].toUpperCase()}${c.color.slice(1)} highlights` })} style={({ pressed }) => [styles.colorPill, { backgroundColor: pressed ? t.chip : t.card, borderColor: t.border }]}><View style={[styles.dot, { backgroundColor: COLOR_SWATCH[c.color as HighlightColor] }]} /><Text style={{ color: t.text, fontSize: 13, textTransform: "capitalize" }}>{c.color}</Text><Text style={{ color: t.muted, fontSize: 13 }}>{c.n}</Text></Pressable>)}</View></> : null}
      <Header title="Collections" count={data.categories.length} />
      {data.categories.length === 0 ? <View style={[styles.collectionEmpty, { borderColor: t.border }]}><Text style={{ color: t.muted, fontSize: 14, lineHeight: 22 }}>Categories from your Mac appear here after syncing. In the meantime, explore by book, color or favorites.</Text></View> : data.categories.map(c => <Pressable key={c.id} accessibilityRole="button" onPress={() => open({ category: String(c.id), title: c.name })} style={({ pressed }) => [styles.category, { backgroundColor: pressed ? t.chip : t.card, borderColor: t.border }]}><View style={{ flex: 1, gap: 4 }}><Text style={{ color: t.text, fontSize: 16, fontWeight: "500" }}>{c.name}</Text>{c.description ? <Text style={{ color: t.muted, fontSize: 13, lineHeight: 20 }} numberOfLines={2}>{c.description}</Text> : null}</View><Text style={{ color: t.muted }}>{c.n}  ›</Text></Pressable>)}
    </>}
  </ScrollView>;
}
function Header({ title, count }: { title: string; count?: number }) {
  const t = useTheme();
  return <View style={styles.sectionHeader}><Text accessibilityRole="header" style={{ fontFamily: serif, color: t.text, fontSize: 23 }}>{title}</Text>{count !== undefined ? <Text style={{ color: t.muted, fontSize: 13 }}>{count}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40, width: "100%", maxWidth: 720, alignSelf: "center" },
  favorites: { flexDirection: "row", alignItems: "center", padding: 20, gap: 16, borderRadius: 20, minHeight: 92 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 32, marginBottom: 16 },
  bookRow: { flexDirection: "row", alignItems: "center", gap: 16, padding: 14, borderRadius: 20, borderWidth: 1, marginBottom: 12 },
  cover: { width: 68, height: 92, borderRadius: 5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  spine: { position: "absolute", left: 5, top: 0, bottom: 0, width: 2, backgroundColor: "#FFFFFF26" },
  coverLetter: { fontFamily: serif, fontSize: 34, color: "#FFF9E8" },
  coverRule: { width: 22, height: 1, backgroundColor: "#FFF9E877", marginTop: 9 },
  bookTitle: { fontFamily: serif, fontSize: 19, lineHeight: 25 },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  colorPill: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  collectionEmpty: { padding: 18, borderRadius: 16, borderWidth: 1, borderStyle: "dashed" },
  category: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, minHeight: 72, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
});
