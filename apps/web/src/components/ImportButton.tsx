"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportEvent } from "@/lib/types";

export function ImportButton({ hasCategories }: { hasCategories: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Exclude<ImportEvent, { type: "progress" }>[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  async function run(rebuild: boolean) {
    setRunning(true);
    setLog([]);
    setProgress(null);
    try {
      const res = await fetch(`/api/import${rebuild ? "?rebuild=1" : ""}`, { method: "POST" });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setLog([{ type: "error", message: err.error }]);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as ImportEvent;
          if (e.type === "progress") {
            setProgress({ done: e.done, total: e.total });
            if (e.done % 200 === 0 || e.done === e.total) router.refresh();
          } else setLog((l) => [...l, e]);
        }
      }
    } catch (e) {
      setLog((l) => [...l, { type: "error", message: (e as Error).message }]);
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {hasCategories && (
          <button
            onClick={() => {
              if (!confirmRebuild) return setConfirmRebuild(true);
              setConfirmRebuild(false);
              run(true);
            }}
            onBlur={() => setConfirmRebuild(false)}
            disabled={running}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Discard categories and let AI redesign them from all highlights"
          >
            {confirmRebuild ? "Click again: replaces all categories" : "Rebuild categories"}
          </button>
        )}
        <button
          onClick={() => run(false)}
          disabled={running}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {running ? "Importing…" : "Import from Apple Books"}
        </button>
      </div>

      {(running || log.length > 0) && (
        <div className="w-96 max-w-full rounded-lg border border-neutral-200 bg-white p-3 text-xs shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {log.map((e, i) => (
            <p
              key={i}
              className={
                e.type === "error"
                  ? "text-red-600"
                  : e.type === "warning"
                    ? "text-amber-600"
                    : e.type === "done"
                      ? "font-medium text-green-600"
                      : "text-neutral-600 dark:text-neutral-400"
              }
            >
              {e.type === "error" ? "✗ " : e.type === "warning" ? "! " : e.type === "done" ? "✓ " : "· "}
              {e.message}
            </p>
          ))}
          {progress && (
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full bg-neutral-900 transition-all dark:bg-white" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-neutral-500">
                {progress.done} / {progress.total} categorized
              </p>
            </div>
          )}
          {!running && (
            <button onClick={() => setLog([])} className="mt-2 text-neutral-400 hover:text-neutral-600">
              dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
