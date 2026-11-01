import { memo } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { COLOR_SWATCH, type Highlight } from "@/lib/types";
import { useTheme } from "@/lib/theme";

interface Props {
  h: Highlight;
  showBook?: boolean;
  onToggleFavorite(h: Highlight): void;
}

export const HighlightCard = memo(function HighlightCard({ h, showBook = true, onToggleFavorite }: Props) {
  const t = useTheme();
  return (
    <Pressable
      onLongPress={() => Share.share({ message: `“${h.text}”\n— ${h.bookTitle}${h.bookAuthor ? `, ${h.bookAuthor}` : ""}` })}
      style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <View style={[styles.bar, { backgroundColor: COLOR_SWATCH[h.color] }]} />
      <View style={styles.body}>
        <Text style={[styles.text, { color: t.text }]} selectable>
          {h.text}
        </Text>
        {h.note ? <Text style={[styles.note, { color: t.text, backgroundColor: t.chip }]}>📝 {h.note}</Text> : null}
        <View style={styles.meta}>
          {showBook && (
            <Text
              onPress={() => router.push({ pathname: "/list", params: { book: h.bookId, title: h.bookTitle } })}
              style={[styles.book, { color: t.muted }]}
              numberOfLines={1}
            >
              {h.bookTitle}
            </Text>
          )}
          {h.chapter ? <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{h.chapter}</Text> : null}
          {h.pending ? <Text style={[styles.small, { color: "#d97706" }]}>• not synced yet</Text> : null}
        </View>
        {h.categories.length > 0 && (
          <View style={styles.chips}>
            {h.categories.map((c) => (
              <Text
                key={c.id}
                onPress={() => router.push({ pathname: "/list", params: { category: String(c.id), title: c.name } })}
                style={[styles.chip, { backgroundColor: t.chip, color: t.text }]}
              >
                {c.name}
              </Text>
            ))}
          </View>
        )}
      </View>
      <Pressable hitSlop={12} onPress={() => onToggleFavorite(h)} style={styles.star}>
        <Text style={{ fontSize: 20, color: h.favorite ? "#f59e0b" : t.border }}>{h.favorite ? "★" : "☆"}</Text>
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  bar: { width: 4, borderRadius: 2 },
  body: { flex: 1, gap: 8 },
  text: { fontSize: 16, lineHeight: 23 },
  note: { fontSize: 14, padding: 8, borderRadius: 8, overflow: "hidden" },
  meta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  book: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  small: { fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 12, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, overflow: "hidden" },
  star: { paddingLeft: 2 },
});
