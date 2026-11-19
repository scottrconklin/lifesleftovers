import { marketplaceConfig } from "@/config/marketplace";

/**
 * Browse radius (SPEC "Cold start" rule 3): default 15 mi, slider 5–50 in 5-mile steps. When
 * fewer than 12 auctions fall inside the buyer's radius, widen it automatically and say so.
 */
const { defaultMiles, minMiles, maxMiles, stepMiles, autoWidenBelowResults } =
  marketplaceConfig.radius;

/** Any input → a radius on the slider: clamped to 5–50 and snapped to the 5-mile steps. */
export function clampRadius(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : input;
  if (typeof n !== "number" || !Number.isFinite(n)) return defaultMiles;
  const snapped = Math.round(n / stepMiles) * stepMiles;
  return Math.min(maxMiles, Math.max(minMiles, snapped));
}

export type RadiusChoice = {
  /** The radius results are shown for. */
  radiusMiles: number;
  /** The radius the buyer asked for. */
  requestedMiles: number;
  /** True when we went past the requested radius to find enough results. */
  widened: boolean;
  /** Results within `radiusMiles`. */
  count: number;
  /** Results within the requested radius. */
  countAtRequested: number;
};

/**
 * Pick the radius to show, given every result's distance (miles) up to the slider's maximum.
 * Widens in 5-mile steps to the first radius with at least 12 results; if 50 miles still has
 * fewer, shows what 50 miles has (widening only when it actually adds something).
 */
export function chooseRadius(distancesMiles: readonly number[], requested: number): RadiusChoice {
  const requestedMiles = clampRadius(requested);
  const countWithin = (r: number) => distancesMiles.filter((d) => d <= r).length;
  const countAtRequested = countWithin(requestedMiles);
  const result = (radiusMiles: number): RadiusChoice => ({
    radiusMiles,
    requestedMiles,
    widened: radiusMiles > requestedMiles,
    count: countWithin(radiusMiles),
    countAtRequested,
  });

  if (countAtRequested >= autoWidenBelowResults) return result(requestedMiles);
  for (let r = requestedMiles + stepMiles; r <= maxMiles; r += stepMiles) {
    if (countWithin(r) >= autoWidenBelowResults) return result(r);
  }
  return countWithin(maxMiles) > countAtRequested ? result(maxMiles) : result(requestedMiles);
}

/** The message shown above results (SPEC voice; "Never show zero"). Null when nothing to say. */
export function radiusNotice(
  choice: RadiusChoice,
): { tone: "info" | "empty"; text: string } | null {
  const noun = (n: number) => (n === 1 ? "auction" : "auctions");
  if (choice.count === 0) {
    return { tone: "empty", text: "Nothing near you yet. Widen your radius?" };
  }
  if (choice.widened) {
    return {
      tone: "info",
      text: `Showing ${choice.count} ${noun(choice.count)} within ${choice.radiusMiles} miles`,
    };
  }
  return null;
}
