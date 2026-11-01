import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useSQLiteContext } from "expo-sqlite";
import { counts, getMeta, setMeta } from "@/lib/db";
import { setPastedText } from "@/lib/incoming";
import { bumpData, useDataVersion } from "@/lib/store";
import { sync } from "@/lib/sync";
import { serif, useTheme } from "@/lib/theme";

export default function SyncScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [address, setAddress] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [libraryAt, setLibraryAt] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof counts>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const syncLock = useRef(false);
  const pasteLock = useRef(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getMeta(db, "server").then((a) => { if (active && a) setAddress(a); }).catch(() => {
      if (active) setMessage({ ok: false, text: "Couldn’t load your saved Mac address. You can enter it again below." });
    });
    return () => { active = false; };
  }, [db]);
  useEffect(() => {
    let active = true;
    Promise.all([getMeta(db, "last_sync"), getMeta(db, "library_at"), counts(db)])
      .then(([last, library, count]) => { if (active) { setLastSync(last); setLibraryAt(library); setStats(count); } })
      .catch(() => { if (active) setMessage({ ok: false, text: "Couldn’t load library details. Your saved highlights have not been changed." }); });
    return () => { active = false; };
  }, [db, version]);

  async function runSync() {
    if (syncLock.current || !address.trim()) return;
    syncLock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await setMeta(db, "server", address.trim());
      const r = await sync(db);
      const parts = [`${r.highlights} highlights on your phone`];
      if (r.uploaded) parts.push(`${r.uploaded} shared highlight${r.uploaded === 1 ? "" : "s"} sent to your Mac`);
      if (r.duplicates) parts.push(`${r.duplicates} already existed`);
      if (r.categorizing) parts.push("new categories will arrive on your next sync");
      setMessage({ ok: true, text: parts.join(" · ") });
      bumpData();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Sync didn’t finish. Check the address and try again." });
    } finally {
      syncLock.current = false;
      setBusy(false);
    }
  }

  async function paste() {
    if (pasteLock.current) return;
    pasteLock.current = true;
    setPasting(true);
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        Alert.alert("Nothing to paste yet", "In Apple Books, open a book’s Notes, select highlights and tap Copy. Then return here to paste them.");
        return;
      }
      setPastedText(text);
      router.push("/share");
    } catch {
      Alert.alert("Couldn’t read the clipboard", "Try copying your highlights again, or share them directly from Apple Books to Book Notes.");
    } finally {
      pasteLock.current = false;
      setPasting(false);
    }
  }

  const pending = (stats?.pendingShared ?? 0) + (stats?.pendingFavs ?? 0);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={[styles.eyebrow, { color: t.accent }]}>KEEP THE WORDS THAT MATTER</Text>
        <Text accessibilityRole="header" style={[styles.heading, { color: t.text }]}>Bring your reading{ "\n" }with you.</Text>
        <Text style={[styles.help, { color: t.muted }]}>Add a passage from Apple Books. Read it again, whenever you need it.</Text>
      </View>
      <Section title="From Apple Books">
        <View style={[styles.steps, { backgroundColor: t.softAccent }]}>
          {[
            ["1", "Open your book’s Notes", "Select the highlights you want to keep."],
            ["2", "Share to Book Notes", "Or tap Copy, then paste them below."],
            ["3", "Review and save", "Check the book title and make it yours."],
          ].map(([number, title, detail]) => (
            <View key={number} style={styles.step}>
              <View style={[styles.number, { backgroundColor: t.card }]}><Text style={{ color: t.accent, fontWeight: "600" }}>{number}</Text></View>
              <View style={{ flex: 1, gap: 3 }}><Text style={[styles.stepTitle, { color: t.text }]}>{title}</Text><Text style={[styles.detail, { color: t.muted }]}>{detail}</Text></View>
            </View>
          ))}
        </View>
        <Button label={pasting ? "Opening preview…" : "Paste from Apple Books"} onPress={paste} disabled={pasting} primary />
        <Text style={[styles.caption, { color: t.muted }]}>You’ll always review highlights before saving.</Text>
      </Section>
      <Section title="Your library, on this phone">
        <Text style={[styles.libraryCount, { color: t.text }]}>{stats ? stats.highlights.toLocaleString() : "—"}<Text style={[styles.help, { color: t.muted }]}>  saved highlights</Text></Text>
        <Text style={[styles.help, { color: t.muted }]}>Saved locally, ready to read offline.</Text>
        {!!pending && <Text style={[styles.detail, { color: t.accent }]}>{pending} change{pending === 1 ? "" : "s"} waiting to sync to your Mac</Text>}
        {libraryAt && <Text style={[styles.detail, { color: t.muted }]}>Bundled library · {new Date(libraryAt).toLocaleDateString()}</Text>}
      </Section>
      <Section title="Sync with your Mac">
        <Text style={[styles.eyebrow, { color: t.muted }]}>OPTIONAL · SAME WI-FI NETWORK</Text>
        <Text style={[styles.help, { color: t.muted }]}>Open Book Notes on your Mac and enter the iPhone sync address shown there.</Text>
        <Text style={[styles.stepTitle, { color: t.text }]}>Mac address</Text>
        <TextInput accessibilityLabel="Mac sync address" value={address} onChangeText={setAddress} placeholder="192.168.1.183:57706" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} style={[styles.input, { backgroundColor: t.bg, color: t.text, borderColor: t.border }]} />
        <Button label={busy ? "Syncing your library…" : "Sync now"} onPress={runSync} disabled={busy || !address.trim()} />
        {busy && <ActivityIndicator color={t.accent} accessibilityLabel="Syncing" />}
        {message && <Text accessibilityLiveRegion="polite" style={[styles.help, { color: message.ok ? t.success : t.danger }]}>{message.ok ? "Sync complete. " : ""}{message.text}</Text>}
        <Text style={[styles.detail, { color: t.muted }]}>{lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : "Your highlights stay on this phone even when your Mac is offline."}</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[styles.section, { backgroundColor: t.card, borderColor: t.border }]}><Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>{title}</Text>{children}</View>;
}
function Button({ label, onPress, disabled, primary }: { label: string; onPress(): void; disabled?: boolean; primary?: boolean }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, { backgroundColor: primary ? t.accent : t.softAccent, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}><Text style={{ color: primary ? t.accentText : t.accent, fontWeight: "600", fontSize: 16, textAlign: "center" }}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 48, maxWidth: 680, width: "100%", alignSelf: "center" },
  intro: { gap: 12, paddingVertical: 12, paddingBottom: 8 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  heading: { fontFamily: serif, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  section: { padding: 20, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, gap: 14 },
  title: { fontFamily: serif, fontSize: 23, lineHeight: 29 },
  help: { fontSize: 15, lineHeight: 23 },
  detail: { fontSize: 13, lineHeight: 19 },
  caption: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  steps: { padding: 16, borderRadius: 16, gap: 20 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  number: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTitle: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  libraryCount: { fontFamily: serif, fontSize: 34 },
  input: { minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  button: { minHeight: 52, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, justifyContent: "center", alignItems: "center" },
});
