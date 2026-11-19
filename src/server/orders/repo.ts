import "server-only";
import { getSql } from "@/db/client";

export type AuctionOutcome = {
  kind: "sale" | "free_claim";
  priceCents: number;
  totalCents: number;
  /** Whether the viewer is the winner. Never who else won. */
  viewerWon: boolean;
};

/** How a closed auction ended, from the viewer's side. Null if it produced no order (unsold). */
export async function outcomeForAuction(
  auctionId: string,
  viewerId: string | null,
): Promise<AuctionOutcome | null> {
  const [row] = await getSql()<
    { kind: AuctionOutcome["kind"]; price_cents: number; total_cents: number; mine: boolean }[]
  >`
    select kind, price_cents, total_cents, coalesce(buyer_id = ${viewerId}, false) as mine
    from public.orders where auction_id = ${auctionId}`;
  if (!row) return null;
  return {
    kind: row.kind,
    priceCents: row.price_cents,
    totalCents: row.total_cents,
    viewerWon: Boolean(row.mine),
  };
}
