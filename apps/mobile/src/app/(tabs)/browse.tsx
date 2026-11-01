import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { counts, listBooks, listCategories, listColors } from "@/lib/db";
import { useDataVersion } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { COLOR_SWATCH, type HighlightColor } from "@/lib/types";

type Data = {
  categories: Awaited<ReturnType<typeof listCategories>>;
  books: Awaited<ReturnType<typeof listBooks>>;
  colors: Awaited<ReturnType<typeof listColors>>;
  favorites: number;
};

export default function Browse() {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    Promise.all([listCategories(db), listBooks(db), listColors(db), counts(db)]).then(([categories, books, colors, c]) =>
      setData({ categories, books, colors, favorites: c.favorites }),
    );
  }, [db, version]);

  const open = (params: Record<string, string>) => router.push({ pathname: "/list", params });

  if (!data) return null;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <Row label="★ Favorites" count={data.favorites} onPress={() => open({ favorite: "1", title: "Favorites" })} />

      {data.colors.length > 0 && (
        <>
          <Header text="Colors" />
          <View style={styles.colors}>
            {data.colors.map((c) => (
              <Pressable
                key={c.color}
                onPress={() => open({ color: c.color, title: `${c.color[0].toUpperCase()}${c.color.slice(1)} highlights` })}
                style={[styles.colorPill, { backgroundColor: t.card, borderColor: t.border }]}
              >
                <View style={[styles.dot, { backgroundColor: COLOR_SWATCH[c.color as HighlightColor] }]} />
                <Text style={{ color: t.text, fontSize: 14 }}>{c.n}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Header text="Categories" />
      {data.categories.length === 0 ? (
        <Text style={{ color: t.muted, paddingHorizontal: 4 }}>No categories yet. Import on your Mac with an API key set, then sync.</Text>
      ) : (
        data.categories.map((c) => (
          <Row key={c.id} label={c.name} sub={c.description} count={c.n} onPress={() => open({ category: String(c.id), title: c.name })} />
        ))
      )}

      <Header text="Books" />
      {data.books.map((b) => (
        <Row key={b.id} label={b.title} sub={b.author} count={b.n} onPress={() => open({ book: b.id, title: b.title })} />
      ))}
    </ScrollView>
  );
}

function Header({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={[styles.header, { color: t.muted }]}>{text.toUpperCase()}</Text>;
}

function Row({ label, sub, count, onPress }: { label: string; sub?: string | null; count: number; onPress(): void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.chip : t.card, borderColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={2}>
          {label}
        </Text>
        {sub ? (
          <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: t.muted, fontSize: 14 }}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  header: { fontSize: 12, fontWeight: "600", letterSpacing: 0.6, marginTop: 18, marginBottom: 2, paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  colorPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
