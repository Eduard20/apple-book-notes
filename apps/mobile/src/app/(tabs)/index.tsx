import { router } from "expo-router";
import { HighlightList } from "@/components/HighlightList";
import { EmptyState } from "@/components/ReadingUI";

export default function HighlightsScreen() {
  return <HighlightList filters={{}} empty={<EmptyState title="Keep the words that stay" detail="Bring a highlight from Apple Books. Your favorite ideas will be here, ready to revisit — even offline." action="Add your first highlights" onPress={() => router.navigate("/sync")} />} />;
}
