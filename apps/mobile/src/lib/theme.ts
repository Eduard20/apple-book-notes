import { useColorScheme } from "react-native";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? "#0a0a0a" : "#f5f5f4",
    card: dark ? "#171717" : "#ffffff",
    text: dark ? "#f5f5f5" : "#171717",
    muted: dark ? "#a3a3a3" : "#737373",
    border: dark ? "#262626" : "#e5e5e5",
    chip: dark ? "#262626" : "#f0f0ef",
    accent: dark ? "#ffffff" : "#171717",
    accentText: dark ? "#171717" : "#ffffff",
  };
}
