"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWatchAction } from "@/app/bid/actions";

/** The heart on the item photo (mockup: "Watch this item"). */
export function WatchButton({
  listingId,
  watching: initial,
}: {
  listingId: string;
  watching: boolean;
}) {
  const [watching, setWatching] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={watching ? "Stop watching this item" : "Watch this item"}
      aria-pressed={watching}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await toggleWatchAction(listingId);
          if ("signIn" in result) router.push(result.signIn);
          else setWatching(result.watching);
        })
      }
      className="flex size-11 items-center justify-center rounded-full bg-white text-brand-navy"
    >
      <Heart
        aria-hidden="true"
        className="size-5.5"
        fill={watching ? "#D94B35" : "none"}
        stroke={watching ? "#D94B35" : "currentColor"}
        strokeWidth={2}
      />
    </button>
  );
}
