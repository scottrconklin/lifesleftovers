import { PartyPopper } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { AuctionOutcome } from "@/server/orders/repo";

/**
 * The item page after closing (SPEC states: won, unsold). Sold shows the final price to everyone;
 * the winner gets "You won!" and what happens next. Who won is never shown to anyone else.
 */
export function ClosedAuction({
  outcome,
  bidCount,
  isOwner,
}: {
  outcome: AuctionOutcome | null;
  bidCount: number;
  isOwner: boolean;
}) {
  const headline = !outcome
    ? "Ended without a sale"
    : outcome.kind === "free_claim"
      ? "Claimed in the draw"
      : `Sold for ${formatCents(outcome.priceCents)}`;
  const detail = !outcome
    ? isOwner
      ? null
      : "Nobody took it home this time."
    : outcome.kind === "free_claim"
      ? "Nobody bid, so a random draw picked who gets it."
      : `${bidCount} ${bidCount === 1 ? "bid" : "bids"}`;

  return (
    <>
      <div className="rounded-xl bg-white px-4 py-3.5" data-testid="closed-auction">
        <div className="text-[13px] text-brand-ink-muted">Auction closed</div>
        <div
          className="font-display text-[28px] leading-tight font-extrabold text-brand-navy"
          data-testid="closed-headline"
        >
          {headline}
        </div>
        {detail ? <div className="text-[13px] text-brand-ink-muted">{detail}</div> : null}
      </div>
      {outcome?.viewerWon ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-brand-avocado"
        >
          <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>
            {outcome.kind === "free_claim"
              ? "You won the draw! It's yours, free. "
              : `You won! Your total is ${formatCents(outcome.totalCents)} with the buyer's premium. `}
            We&apos;ll be in touch about pickup.
          </span>
        </p>
      ) : null}
    </>
  );
}
