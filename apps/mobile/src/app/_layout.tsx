import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { ShareIntentProvider } from "expo-share-intent";
import { DB_NAME, migrate } from "@/lib/db";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const t = useTheme();
  return (
    // ShareIntentProvider must be the outermost provider.
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ contentStyle: { backgroundColor: t.bg }, headerStyle: { backgroundColor: t.bg }, headerTintColor: t.accent, headerTitleStyle: { color: t.text }, headerShadowVisible: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="list" options={{ headerBackButtonDisplayMode: "minimal" }} />
          <Stack.Screen name="share" options={{ presentation: "modal", title: "Add highlights" }} />
        </Stack>
      </SQLiteProvider>
    </ShareIntentProvider>
  );
}

