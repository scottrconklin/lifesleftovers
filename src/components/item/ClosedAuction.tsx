import { CircleAlert, PartyPopper } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import type { AuctionOutcome } from "@/server/orders/repo";

/**
 * The item page after closing (SPEC states: won, unsold). Sold shows the final price to everyone;
 * the winner gets "You won!" and a link to their order, the seller a link to the sale. Who won is
 * never shown to anyone else.
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
  const order = outcome?.viewerOrder ?? null;

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
      {outcome?.viewerWon && order ? (
        <div className="flex flex-col gap-3 rounded-xl bg-white px-4 py-3">
          <WinnerNote outcome={outcome} status={order.status} />
          <Link
            href={`/orders/${order.id}`}
            className={buttonVariants({ className: "self-start" })}
          >
            {order.status === "offered" ? "See the offer" : "See your order"}
          </Link>
        </div>
      ) : null}
      {isOwner && order && !outcome?.viewerWon ? (
        <Link
          href={`/orders/${order.id}`}
          className={buttonVariants({ variant: "outline", className: "self-start bg-white" })}
        >
          See the sale
        </Link>
      ) : null}
    </>
  );
}

function WinnerNote({
  outcome,
  status,
}: {
  outcome: AuctionOutcome;
  status: NonNullable<AuctionOutcome["viewerOrder"]>["status"];
}) {
  if (status === "payment_failed") {
    return (
      <p role="status" className="flex items-start gap-2 text-brand-tomato-deep">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>You won, but your card didn&apos;t go through. Fix it to keep your win.</span>
      </p>
    );
  }
  const text =
    status === "offered"
      ? "Second chance! The winner didn't pay, so it's yours if you still want it."
      : outcome.kind === "free_claim"
        ? "You won the draw! It's yours, free."
        : status === "awaiting_payment"
          ? `You won! Your total is ${formatCents(outcome.totalCents)} with the buyer's premium.`
          : `You won! Paid ${formatCents(outcome.totalCents)} with the buyer's premium.`;
  return (
    <p role="status" className="flex items-start gap-2 text-brand-avocado">
      <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
