import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useSQLiteContext } from "expo-sqlite";
import { counts, getMeta, setMeta } from "@/lib/db";
import { setPastedText } from "@/lib/incoming";
import { bumpData, useDataVersion } from "@/lib/store";
import { sync } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

export default function SyncScreen() {
  const db = useSQLiteContext();
  const t = useTheme();
  const version = useDataVersion();
  const [address, setAddress] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [libraryAt, setLibraryAt] = useState<string | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof counts>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getMeta(db, "server").then((a) => a && setAddress(a));
  }, [db]);
  useEffect(() => {
    getMeta(db, "last_sync").then(setLastSync);
    getMeta(db, "library_at").then(setLibraryAt);
    counts(db).then(setStats);
  }, [db, version]);

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      if (address.trim()) await setMeta(db, "server", address.trim());
      const r = await sync(db);
      const parts = [`${r.highlights} highlights on your phone`];
      if (r.uploaded) parts.push(`${r.uploaded} shared highlight${r.uploaded === 1 ? "" : "s"} sent to your Mac`);
      if (r.duplicates) parts.push(`${r.duplicates} already existed`);
      if (r.categorizing) parts.push("categories for new ones will arrive on your next sync");
      setMessage({ ok: true, text: parts.join(" · ") });
      bumpData();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    const text = await Clipboard.getStringAsync();
    if (!text.trim()) {
      Alert.alert("Clipboard is empty", "In Apple Books, select highlights in a book's Notes and tap Copy, then come back here.");
      return;
    }
    setPastedText(text);
    router.push("/share");
  }

  const pending = (stats?.pendingShared ?? 0) + (stats?.pendingFavs ?? 0);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
    >
      <Section title="Sync with your Mac">
        <Text style={[styles.help, { color: t.muted }]}>
          Your library is built into the app (run npm run ios:install on the Mac to refresh it). To sync over Wi-Fi instead, start Book Notes on your Mac and enter the iPhone sync address shown on the web page.
        </Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.183:57706"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }]}
        />
        <Button label={busy ? "Syncing…" : "Sync now"} onPress={runSync} disabled={busy || !address.trim()} primary />
        {busy && <ActivityIndicator />}
        {message && <Text style={{ color: message.ok ? "#16a34a" : "#dc2626", fontSize: 14, lineHeight: 20 }}>{message.text}</Text>}
        <Text style={[styles.help, { color: t.muted }]}>
          {stats ? `${stats.highlights} highlights on this phone` : ""}
          {libraryAt ? ` · library from your Mac as of ${new Date(libraryAt).toLocaleString()}` : ""}
          {lastSync ? ` · last Wi-Fi sync ${new Date(lastSync).toLocaleString()}` : ""}
          {pending ? ` · ${pending} change${pending === 1 ? "" : "s"} waiting to upload` : ""}
        </Text>
      </Section>

      <Section title="Add from Apple Books on this iPhone">
        <Text style={[styles.help, { color: t.muted }]}>
          In Apple Books, open a book → Notes → select highlights → Share → Book Notes.{"\n"}
          If Book Notes isn’t in the share sheet, tap Copy instead and use the button below.
        </Text>
        <Button label="Paste from Apple Books" onPress={paste} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.card, borderColor: t.border }]}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Button({ label, onPress, disabled, primary }: { label: string; onPress(): void; disabled?: boolean; primary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: t.accent } : { borderColor: t.border, borderWidth: 1 },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ color: primary ? t.accentText : t.text, fontWeight: "600", fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: { padding: 16, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  title: { fontSize: 17, fontWeight: "600" },
  help: { fontSize: 13, lineHeight: 19 },
  input: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: "center" },
});
