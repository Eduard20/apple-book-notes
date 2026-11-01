import { getShareExtensionKey } from "expo-share-intent";

// The iOS share extension opens the app with a special URL; route it to the share preview screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return "/share";
    return path;
  } catch {
    return "/";
  }
}
