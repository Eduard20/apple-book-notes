import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        headerTitleStyle: { color: t.text, fontSize: 14, fontWeight: "600" },
        headerStyle: { backgroundColor: t.bg },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Book Notes", tabBarLabel: "Highlights", tabBarIcon: ({ color }) => <SymbolView name="quote.opening" tintColor={color} size={22} /> }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: "Your library", tabBarLabel: "Library", tabBarIcon: ({ color }) => <SymbolView name="square.grid.2x2" tintColor={color} size={22} /> }}
      />
      <Tabs.Screen
        name="sync"
        options={{ title: "Add highlights", tabBarLabel: "Add", tabBarIcon: ({ color }) => <SymbolView name="plus.circle" tintColor={color} size={22} /> }}
      />
    </Tabs>
  );
}

