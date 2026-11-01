"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BookTitleEditor({ id, title, author }: { id: string; title: string; author: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [t, setT] = useState(title);
  const [a, setA] = useState(author ?? "");

  async function save() {
    await fetch(`/api/books/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, author: a }),
    });
    setEditing(false);
    router.refresh();
  }

  if (!editing)
    return (
      <div className="flex items-baseline gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {author && <p className="text-sm text-neutral-500">{author}</p>}
        </div>
        <button onClick={() => setEditing(true)} className="text-xs text-neutral-400 hover:text-neutral-700">
          rename
        </button>
      </div>
    );

  const input = "rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input className={`${input} w-80`} value={t} onChange={(e) => setT(e.target.value)} placeholder="Title" autoFocus />
      <input className={`${input} w-48`} value={a} onChange={(e) => setA(e.target.value)} placeholder="Author" />
      <button className="rounded bg-neutral-900 px-3 py-1 text-sm text-white dark:bg-white dark:text-neutral-900">Save</button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
        Cancel
      </button>
    </form>
  );
}
