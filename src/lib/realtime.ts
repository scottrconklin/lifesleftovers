/** What a bid broadcast carries: public facts only (no bidder, no maximum). */
export type AuctionUpdate = {
  auctionId: string;
  currentPriceCents: number;
  bidCount: number;
  /** ISO time; may have moved later (soft close). */
  endsAt: string;
  extended: boolean;
};

export function isAuctionUpdate(value: unknown): value is AuctionUpdate {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.auctionId === "string" &&
    Number.isSafeInteger(v.currentPriceCents) &&
    Number.isSafeInteger(v.bidCount) &&
    typeof v.endsAt === "string" &&
    !Number.isNaN(Date.parse(v.endsAt)) &&
    typeof v.extended === "boolean"
  );
}

/** What a close broadcast carries: how it ended and the final price, nothing about who. */
export type AuctionClosed = {
  auctionId: string;
  outcome: "sold" | "unsold";
  priceCents: number;
};

export function isAuctionClosed(value: unknown): value is AuctionClosed {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.auctionId === "string" &&
    (v.outcome === "sold" || v.outcome === "unsold") &&
    Number.isSafeInteger(v.priceCents)
  );
}
