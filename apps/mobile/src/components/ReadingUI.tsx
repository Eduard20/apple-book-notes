import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { serif, useTheme } from "@/lib/theme";

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const t = useTheme();
  return <View style={styles.heading}>
    {eyebrow ? <Text style={[styles.eyebrow, { color: t.accent }]}>{eyebrow.toUpperCase()}</Text> : null}
    <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>{title}</Text>
    {subtitle ? <Text style={[styles.subtitle, { color: t.muted }]}>{subtitle}</Text> : null}
  </View>;
}

export function EmptyState({ title, detail, action, onPress, loading = false }: { title: string; detail?: string; action?: string; onPress?: () => void; loading?: boolean }) {
  const t = useTheme();
  return <View style={[styles.empty, { backgroundColor: t.card, borderColor: t.border }]}>
    {loading ? <ActivityIndicator color={t.accent} style={{ marginBottom: 20 }} /> : <View style={[styles.mark, { backgroundColor: t.softAccent }]}><Text accessible={false} style={{ fontFamily: serif, fontSize: 38, color: t.accent }}>“</Text></View>}
    <Text accessibilityRole="header" style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
    {detail ? <Text style={[styles.detail, { color: t.muted }]}>{detail}</Text> : null}
    {action && onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: t.accent, opacity: pressed ? 0.75 : 1 }]}><Text style={{ color: t.accentText, fontSize: 15, fontWeight: "600" }}>{action}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  heading: { gap: 8, paddingTop: 16, paddingBottom: 26 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  title: { fontFamily: serif, fontSize: 36, lineHeight: 43, letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 23 },
  empty: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 36, borderRadius: 24, borderWidth: 1, marginTop: 10 },
  mark: { height: 60, width: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 20, paddingTop: 10 },
  emptyTitle: { fontFamily: serif, fontSize: 24, textAlign: "center" },
  detail: { fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 10 },
  action: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, paddingVertical: 12, marginTop: 24 },
});
