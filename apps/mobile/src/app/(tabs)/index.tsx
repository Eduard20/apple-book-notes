import { Text } from "react-native";
import { router } from "expo-router";
import { HighlightList } from "@/components/HighlightList";
import { useTheme } from "@/lib/theme";

export default function HighlightsScreen() {
  const t = useTheme();
  return (
    <HighlightList
      filters={{}}
      empty={
        <Text style={{ color: t.muted, textAlign: "center", marginTop: 60, fontSize: 15, lineHeight: 22, paddingHorizontal: 24 }}>
          No highlights on this phone yet.{"\n\n"}
          <Text style={{ color: t.text, fontWeight: "600" }} onPress={() => router.navigate("/sync")}>
            Sync from your Mac →
          </Text>
        </Text>
      }
    />
  );
}
