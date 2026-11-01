import "server-only";

// One import/categorize job at a time per server process (survives dev hot reloads).
const g = globalThis as unknown as { __abnBusy?: boolean };

export function tryLock(): boolean {
  if (g.__abnBusy) return false;
  g.__abnBusy = true;
  return true;
}
export function unlock() {
  g.__abnBusy = false;
}
