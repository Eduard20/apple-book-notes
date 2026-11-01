import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useSQLiteContext } from "expo-sqlite";
import { addShared, getMeta, listBooks } from "@/lib/db";
import { takePastedText } from "@/lib/incoming";
import { parseShare } from "@/lib/parseShare";
import { bumpData } from "@/lib/store";
import { sync } from "@/lib/sync";
import { serif, useTheme } from "@/lib/theme";

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
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const validItems = items.filter((item) => item.text.trim());

  useEffect(() => {
    let active = true;
    listBooks(db).then((rows) => { if (active) setBooks(rows); }).catch(() => {});
    return () => { active = false; };
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
    if (saveLock.current) return;
    if (!validItems.length) return;
    if (!title.trim()) return Alert.alert("Which book?", "Enter the book title so these highlights are grouped correctly.");
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      await addShared(db, { title: title.trim(), author: author.trim() || null }, validItems);
      bumpData();
      // Upload right away if the Mac is reachable; otherwise it stays queued for the next sync.
      getMeta(db, "server").then((server) => { if (server) return sync(db).then(bumpData); }).catch(() => {});
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save these highlights. Please try again.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  if (!text.trim()) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <Text style={[styles.heading, { color: t.text }]}>A little inspiration?</Text>
        <Text style={[styles.help, { color: t.muted, textAlign: "center" }]}>Share a highlight from Apple Books, or copy one and choose Paste from Apple Books.</Text>
        <Pressable accessibilityRole="button" onPress={close} style={[styles.save, { backgroundColor: t.accent, paddingHorizontal: 28 }]}><Text style={{ color: t.accentText, fontWeight: "600" }}>Back to Book Notes</Text></Pressable>
      </View>
    );
  }

  const input = [styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }];
  const disabled = saving || !validItems.length;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: t.accent }]}>MAKE IT PART OF YOUR LIBRARY</Text>
        <Text accessibilityRole="header" style={[styles.heading, { color: t.text }]}>Keep these words.</Text>
        <Text style={[styles.help, { color: t.muted }]}>Check the details below. You can edit a passage or remove anything you don’t want to keep.</Text>
      </View>
      {!parsed.recognized && <Text style={[styles.notice, { color: t.text, backgroundColor: t.softAccent }]}>This text doesn’t look like an Apple Books export. Check the title and passages before saving.</Text>}

      <Text style={[styles.label, { color: t.muted }]}>THE BOOK</Text>
      <TextInput accessibilityLabel="Book title" editable={!saving} value={title} onChangeText={setTitle} placeholder="Book title" placeholderTextColor={t.muted} style={input} />
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((b, index) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Use ${b.title}`} disabled={saving} key={`${b.title}-${index}`} onPress={() => { setTitle(b.title); setAuthor(b.author ?? ""); }} style={({ pressed }) => [styles.suggestion, { backgroundColor: t.chip, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={{ color: t.text, fontSize: 13 }} numberOfLines={2}>{b.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <TextInput accessibilityLabel="Author, optional" editable={!saving} value={author} onChangeText={setAuthor} placeholder="Author (optional)" placeholderTextColor={t.muted} style={input} />

      <Text style={[styles.label, { color: t.muted }]}>{items.length} PASSAGE{items.length === 1 ? "" : "S"} TO REVIEW</Text>
      {items.map((it, i) => (
        <View key={i} style={[styles.item, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={styles.itemHeader}>
            <Text style={[styles.eyebrow, { color: t.muted }]}>HIGHLIGHT {String(i + 1).padStart(2, "0")}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove highlight ${i + 1}`} disabled={saving} onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))} style={({ pressed }) => [styles.remove, { backgroundColor: pressed ? t.chip : "transparent" }]}><Text style={{ color: t.muted, fontSize: 13 }}>Remove</Text></Pressable>
          </View>
          <TextInput accessibilityLabel={`Highlight ${i + 1}`} editable={!saving} multiline value={it.text} onChangeText={(v) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, text: v } : x)))} placeholder="Write a passage to keep…" placeholderTextColor={t.muted} style={[styles.passage, { color: t.text }]} />
        </View>
      ))}
      {!validItems.length && <Text style={[styles.notice, { backgroundColor: t.softAccent, color: t.text }]}>No passages to save. Keep at least one non-empty highlight, or cancel and start again.</Text>}
      {error && <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: t.card, color: t.danger }]}>Couldn’t save. {error}</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: saving }} onPress={save} disabled={disabled} style={({ pressed }) => [styles.save, { backgroundColor: t.accent, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
        <Text style={{ color: t.accentText, fontWeight: "600", fontSize: 16, textAlign: "center" }}>{saving ? "Saving to your library…" : `Save ${validItems.length} highlight${validItems.length === 1 ? "" : "s"}`}</Text>
      </Pressable>
      <Text style={[styles.caption, { color: t.muted }]}>Saved on this phone. Available offline.</Text>
      <Pressable accessibilityRole="button" disabled={saving} onPress={close} style={styles.cancel}><Text style={{ color: t.muted, fontSize: 15 }}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRaw }} onPress={() => setShowRaw((s) => !s)} style={styles.cancel}><Text style={{ color: t.muted, fontSize: 13, textAlign: "center" }}>{showRaw ? "Hide" : "Show"} original text</Text></Pressable>
      {showRaw && <Text selectable style={[styles.notice, { color: t.muted, backgroundColor: t.chip }]}>{text}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 60, maxWidth: 680, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 },
  intro: { gap: 12, paddingVertical: 12 },
  heading: { fontFamily: serif, fontSize: 34, lineHeight: 41, letterSpacing: -0.7 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  help: { fontSize: 15, lineHeight: 23 },
  notice: { fontSize: 14, lineHeight: 22, padding: 16, borderRadius: 14, overflow: "hidden" },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.4, marginTop: 16, marginBottom: 2 },
  input: { minHeight: 54, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: "center", borderRadius: 12, maxWidth: "100%" },
  item: { padding: 18, paddingTop: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  remove: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center", borderRadius: 8 },
  passage: { fontFamily: serif, fontSize: 19, lineHeight: 29, minHeight: 72, textAlignVertical: "top", paddingVertical: 8 },
  save: { minHeight: 54, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, justifyContent: "center", alignItems: "center", marginTop: 12 },
  caption: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  cancel: { alignItems: "center", justifyContent: "center", minHeight: 48, paddingVertical: 12 },
});
