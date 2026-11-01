import { memo } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { COLOR_SWATCH, type Highlight } from "@/lib/types";
import { serif, useTheme } from "@/lib/theme";

interface Props { h: Highlight; showBook?: boolean; onToggleFavorite(h: Highlight): void; }

export const HighlightCard = memo(function HighlightCard({ h, showBook = true, onToggleFavorite }: Props) {
  const t = useTheme();
  async function share() {
    try { await Share.share({ message: `“${h.text}”\n— ${h.bookTitle}${h.bookAuthor ? `, ${h.bookAuthor}` : ""}` }); }
    catch { Alert.alert("Couldn't share", "Please try again."); }
  }
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={styles.topline}>
        <View style={styles.source}>
          <View accessibilityLabel={`${h.color} highlight`} style={[styles.dot, { backgroundColor: COLOR_SWATCH[h.color] }]} />
          <Text style={[styles.overline, { color: t.muted }]}>{h.pending ? "SAVED ON THIS PHONE" : "FROM YOUR READING"}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={h.favorite ? "Remove from favorites" : "Add to favorites"} accessibilityState={{ selected: h.favorite }} onPress={() => onToggleFavorite(h)} style={styles.iconButton}>
          <Text style={{ fontSize: 25, color: t.accent }}>{h.favorite ? "★" : "☆"}</Text>
        </Pressable>
      </View>
      <Text style={[styles.quote, { color: t.text }]} selectable onLongPress={share}>{h.text}</Text>
      {h.note ? <View style={[styles.note, { backgroundColor: t.chip }]}><Text style={[styles.overline, { color: t.muted }]}>YOUR NOTE</Text><Text selectable style={{ color: t.text, fontSize: 15, lineHeight: 23 }}>{h.note}</Text></View> : null}
      <View style={[styles.footer, { borderColor: t.border }]}>
        <View style={{ flex: 1 }}>
          {showBook ? <Pressable accessibilityRole="button" accessibilityLabel={`Open ${h.bookTitle}`} onPress={() => router.push({ pathname: "/list", params: { book: h.bookId, title: h.bookTitle, author: h.bookAuthor ?? "" } })} style={styles.bookLink}>
            <Text style={[styles.book, { color: t.text }]} numberOfLines={2}>{h.bookTitle}</Text>
            {h.bookAuthor ? <Text style={[styles.small, { color: t.muted }]} numberOfLines={1}>{h.bookAuthor}</Text> : null}
          </Pressable> : null}
          {h.chapter ? <Text style={[styles.small, { color: t.muted }]}>{h.chapter}</Text> : null}
          {h.pending ? <Text style={[styles.small, { color: t.muted }]}>Waiting for Mac sync</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Share highlight" onPress={share} style={styles.share}><Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>Share ↗</Text></Pressable>
      </View>
      {h.categories.length > 0 ? <View style={styles.chips}>{h.categories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Browse ${c.name}`} onPress={() => router.push({ pathname: "/list", params: { category: String(c.id), title: c.name } })} style={[styles.chip, { backgroundColor: t.chip }]}><Text style={{ color: t.text, fontSize: 12 }}>{c.name}</Text></Pressable>)}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingBottom: 16 },
  topline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  source: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  overline: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, flexShrink: 1 },
  iconButton: { width: 48, minHeight: 52, alignItems: "center", justifyContent: "center", marginRight: -12 },
  quote: { fontFamily: serif, fontSize: 20, lineHeight: 31, paddingBottom: 22 },
  note: { padding: 14, borderRadius: 12, marginBottom: 18, gap: 7 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  bookLink: { minHeight: 44, justifyContent: "center", gap: 3 },
  book: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 19 },
  share: { minHeight: 44, minWidth: 56, alignItems: "flex-end", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 12 },
});
