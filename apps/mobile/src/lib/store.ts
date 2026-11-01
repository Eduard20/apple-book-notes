import { useSyncExternalStore } from "react";

// Bumped whenever local data changes (sync, share, favorite) so lists reload.
let version = 0;
const listeners = new Set<() => void>();

export function bumpData() {
  version++;
  listeners.forEach((l) => l());
}

export function useDataVersion() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version,
  );
}
