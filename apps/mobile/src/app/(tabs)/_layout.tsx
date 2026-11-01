import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Highlights", tabBarIcon: ({ color }) => <SymbolView name="quote.opening" tintColor={color} size={22} /> }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: "Browse", tabBarIcon: ({ color }) => <SymbolView name="square.grid.2x2" tintColor={color} size={22} /> }}
      />
      <Tabs.Screen
        name="sync"
        options={{ title: "Sync", tabBarIcon: ({ color }) => <SymbolView name="arrow.triangle.2.circlepath" tintColor={color} size={22} /> }}
      />
    </Tabs>
  );
}
