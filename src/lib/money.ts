import { marketplaceConfig } from "@/config/marketplace";

/** Money is always integer cents. These helpers reject anything else. */
function assertCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of cents, got ${value}`);
  }
}

/** Minimum raise over `currentPriceCents`, from the configured price bands. */
export function bidIncrementCents(currentPriceCents: number): number {
  assertCents(currentPriceCents, "currentPriceCents");
  for (const band of marketplaceConfig.bidIncrements) {
    if (currentPriceCents < band.belowCents) return band.stepCents;
  }
  // Unreachable: the last band is unbounded.
  throw new Error("bidIncrements must end with an unbounded band");
}

/**
 * Buyer's premium on a winning price: 10%, rounded to the nearest cent (half up), minimum $1.
 * Free items carry no premium. (Decisions log, Nov 15, 2026.)
 */
export function buyerPremiumCents(priceCents: number, opts: { isFreeItem?: boolean } = {}): number {
  assertCents(priceCents, "priceCents");
  const { buyerPremiumBps, buyerPremiumMinCents, freeItemPremiumCents } = marketplaceConfig.fees;
  if (opts.isFreeItem) return freeItemPremiumCents;
  const pct = Math.round((priceCents * buyerPremiumBps) / 10_000);
  return Math.max(buyerPremiumMinCents, pct);
}

/** What the seller receives from a sale: the price less the seller fee (0% in V1). */
export function sellerPayoutCents(priceCents: number): number {
  assertCents(priceCents, "priceCents");
  const fee = Math.round((priceCents * marketplaceConfig.fees.sellerFeeBps) / 10_000);
  return priceCents - fee;
}

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

/** Format at the edge only: "$14" for whole dollars, "$1.40" otherwise. */
export function formatCents(cents: number): string {
  assertCents(cents, "cents");
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}
