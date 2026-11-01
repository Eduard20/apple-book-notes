"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";

export function FavoriteButton({ id, favorite }: { id: string; favorite: boolean }) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  return (
    <button
      aria-label={optimistic ? "Unfavorite" : "Favorite"}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await fetch(`/api/highlights/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ favorite: !optimistic }),
          });
          router.refresh();
        })
      }
      className={`text-lg leading-none transition ${optimistic ? "text-amber-400" : "text-neutral-300 hover:text-amber-300 dark:text-neutral-600"}`}
    >
      {optimistic ? "★" : "☆"}
    </button>
  );
}
