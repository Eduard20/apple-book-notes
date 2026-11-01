import { Platform, useColorScheme } from "react-native";

// System fonts keep the reading experience offline, with no font-loading flash.
export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    dark,
    bg: dark ? "#151C19" : "#F7F5EF",
    card: dark ? "#202A25" : "#FFFEFA",
    text: dark ? "#F1F2E9" : "#243B30",
    muted: dark ? "#B3BDB3" : "#657267",
    border: dark ? "#38473D" : "#DFE3D9",
    chip: dark ? "#303F34" : "#EDEFE6",
    accent: dark ? "#B4D3A5" : "#355E46",
    accentText: dark ? "#182A1E" : "#FFFFFF",
    softAccent: dark ? "#293D2F" : "#E7EEDC",
    danger: dark ? "#FFB4A8" : "#A53D2D",
    success: dark ? "#B4D3A5" : "#355E46",
  };
}
