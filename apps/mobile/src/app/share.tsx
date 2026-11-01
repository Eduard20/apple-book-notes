import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useSQLiteContext } from "expo-sqlite";
import { addShared, getMeta, listBooks } from "@/lib/db";
import { takePastedText } from "@/lib/incoming";
import { parseShare } from "@/lib/parseShare";
import { bumpData } from "@/lib/store";
import { sync } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

/** Preview + confirm highlights that came from the iOS share sheet or the clipboard. */
export default function ShareScreen() {
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const [raw] = useState(() => takePastedText());
  const text = raw ?? shareIntent.text ?? "";
  // The share payload can arrive after first render; a new key starts the form fresh.
  return <ShareForm key={text} text={text} fromPaste={!!raw} resetShareIntent={resetShareIntent} />;
}

function ShareForm({ text, fromPaste, resetShareIntent }: { text: string; fromPaste: boolean; resetShareIntent(): void }) {
  const db = useSQLiteContext();
  const t = useTheme();
  const parsed = useMemo(() => parseShare(text), [text]);

  const [title, setTitle] = useState(parsed.bookTitle);
  const [author, setAuthor] = useState(parsed.author);
  const [items, setItems] = useState(parsed.items);
  const [books, setBooks] = useState<{ title: string; author: string | null }[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listBooks(db).then(setBooks);
  }, [db]);

  const suggestions = title.trim()
    ? books.filter((b) => b.title.toLowerCase().includes(title.trim().toLowerCase()) && b.title !== title).slice(0, 4)
    : books.slice(0, 6);

  function close() {
    if (!fromPaste) resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function save() {
    if (!title.trim()) return Alert.alert("Which book?", "Enter the book title so these highlights are grouped correctly.");
    setSaving(true);
    try {
      await addShared(db, { title: title.trim(), author: author.trim() || null }, items.filter((i) => i.text.trim()));
      bumpData();
      // Upload right away if the Mac is reachable; otherwise it stays queued for the next sync.
      if (await getMeta(db, "server")) sync(db).then(bumpData).catch(() => {});
      close();
    } finally {
      setSaving(false);
    }
  }

  if (!text.trim()) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={{ color: t.muted }}>Nothing was shared.</Text>
        <Pressable onPress={close}><Text style={{ color: t.text, marginTop: 12, fontWeight: "600" }}>Close</Text></Pressable>
      </View>
    );
  }

  const input = [styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      {!parsed.recognized && (
        <Text style={styles.warn}>Couldn’t recognize Apple Books’ format. Check the book and highlights below before saving.</Text>
      )}

      <Text style={[styles.label, { color: t.muted }]}>BOOK</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Book title" placeholderTextColor={t.muted} style={input} />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((b) => (
            <Pressable key={b.title} onPress={() => (setTitle(b.title), b.author && setAuthor(b.author))} style={[styles.suggestion, { backgroundColor: t.chip }]}>
              <Text style={{ color: t.text, fontSize: 13 }} numberOfLines={1}>{b.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput value={author} onChangeText={setAuthor} placeholder="Author (optional)" placeholderTextColor={t.muted} style={input} />

      <Text style={[styles.label, { color: t.muted }]}>
        {items.length} HIGHLIGHT{items.length === 1 ? "" : "S"}
      </Text>
      {items.map((it, i) => (
        <View key={i} style={[styles.item, { backgroundColor: t.card, borderColor: t.border }]}>
          <TextInput
            multiline
            value={it.text}
            onChangeText={(v) => setItems((prev) => prev.map((x, j) => (j === i ? { text: v } : x)))}
            style={{ flex: 1, color: t.text, fontSize: 15, lineHeight: 21 }}
          />
          <Pressable hitSlop={10} onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
            <Text style={{ color: t.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={save} disabled={saving || !items.length} style={[styles.save, { backgroundColor: t.accent, opacity: saving || !items.length ? 0.4 : 1 }]}>
        <Text style={{ color: t.accentText, fontWeight: "600", fontSize: 16 }}>
          {saving ? "Saving…" : `Save ${items.length} highlight${items.length === 1 ? "" : "s"}`}
        </Text>
      </Pressable>
      <Pressable onPress={close} style={styles.cancel}>
        <Text style={{ color: t.muted, fontSize: 15 }}>Cancel</Text>
      </Pressable>

      <Pressable onPress={() => setShowRaw((s) => !s)}>
        <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{showRaw ? "Hide" : "Show"} original text</Text>
      </Pressable>
      {showRaw && <Text selectable style={{ color: t.muted, fontSize: 12, fontFamily: "Menlo" }}>{text}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  warn: { color: "#d97706", fontSize: 13, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.6, marginTop: 10 },
  input: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suggestion: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, maxWidth: "100%" },
  item: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  save: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  cancel: { alignItems: "center", paddingVertical: 10 },
});
