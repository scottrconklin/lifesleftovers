"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleWantAction } from "@/app/bid/actions";

/**
 * "I want it" on a free item: if nobody bids by the end, a random draw among everyone who tapped
 * picks who gets it (SPEC "Lots and free items").
 */
export function WantButton({
  listingId,
  auctionId,
  initialWanted,
  initialCount,
}: {
  listingId: string;
  auctionId: string;
  initialWanted: boolean;
  initialCount: number;
}) {
  const [wanted, setWanted] = useState(initialWanted);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const others = wanted ? count - 1 : count;

  return (
    <section aria-labelledby="draw" className="flex flex-col gap-2 rounded-xl bg-white px-4 py-3.5">
      <h2 id="draw" className="text-sm font-bold text-brand-navy">
        Free to a good home
      </h2>
      <p className="text-sm text-brand-ink-muted">
        If nobody bids, a random draw at Closing Night picks one person who tapped &ldquo;I want
        it.&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={wanted}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await toggleWantAction({ listingId, auctionId });
              if (result.status === "sign-in" || result.status === "verify-phone") {
                router.push(result.href);
              } else if (result.status === "error") {
                setError(result.message);
              } else {
                setWanted(result.wanted);
                setCount(result.count);
              }
            })
          }
          className={
            wanted
              ? "inline-flex h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-brand-avocado bg-white px-4 font-bold text-brand-avocado"
              : "inline-flex h-11 items-center rounded-xl bg-brand-avocado px-5 font-bold text-white hover:opacity-90"
          }
        >
          {wanted ? (
            <>
              <Check aria-hidden="true" className="size-4.5" />
              You&apos;re in the draw
            </>
          ) : (
            "I want it"
          )}
        </button>
        <span className="text-sm text-brand-ink-muted" data-testid="want-count">
          {others === 0
            ? wanted
              ? "Just you so far"
              : "Nobody yet"
            : `${others} ${others === 1 ? "other person wants" : "others want"} it`}
        </span>
      </div>
      {wanted ? (
        <p className="text-[13px] text-brand-ink-muted">Tap again to leave the draw.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-brand-tomato-deep">
          {error}
        </p>
      ) : null}
    </section>
  );
}
