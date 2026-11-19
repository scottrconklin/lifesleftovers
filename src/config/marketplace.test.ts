import { describe, expect, it } from "vitest";
import { marketplaceConfig, type UnsoldAction } from "./marketplace";

/** Walk the config and collect every numeric leaf with its path. */
function numericLeaves(value: unknown, path = ""): Array<[string, number]> {
  if (typeof value === "number") return [[path, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => numericLeaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe("marketplaceConfig", () => {
  it("stores money, durations and counts as non-negative integers (cents, never floats)", () => {
    for (const [path, n] of numericLeaves(marketplaceConfig)) {
      if (n === Number.POSITIVE_INFINITY) continue; // the open-ended top increment band
      if (path === "images.clientJpegQuality") continue; // the only ratio
      expect(Number.isSafeInteger(n), path).toBe(true);
      expect(n, path).toBeGreaterThanOrEqual(0);
    }
  });

  it("matches the spec's Build defaults", () => {
    const c = marketplaceConfig;
    expect(c.fees.buyerPremiumBps).toBe(1000);
    expect(c.fees.buyerPremiumMinCents).toBe(100);
    expect(c.fees.sellerFeeBps).toBe(0);
    expect(c.payouts).toEqual({
      intervalDays: 14,
      minimumBalanceCents: 1500,
      autoReleaseHours: 72,
    });
    expect(c.softClose).toEqual({ windowSeconds: 120, extendToSeconds: 120 });
    expect(c.radius).toEqual({
      defaultMiles: 15,
      minMiles: 5,
      maxMiles: 50,
      autoWidenBelowResults: 12,
      stepMiles: 5,
      nearestZipMaxMiles: 25,
    });
    expect(c.closingNight.defaultWeekday).toBe(0);
    expect(c.closingNight.defaultStartLocalTime).toBe("19:00");
    expect(c.closingNight.defaultEndLocalTime).toBe("21:00");
    expect(c.closingNight.defaultTimeZone).toBe("America/Chicago");
    expect(c.closingNight.slotIntervalSeconds).toBe(60);
    expect(c.freeItems).toEqual({ noShowsBeforePause: 2, claimPauseDays: 30 });
  });

  it("has ascending increment bands ending in an unbounded band", () => {
    const bands = marketplaceConfig.bidIncrements;
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i]!.belowCents).toBeGreaterThan(bands[i - 1]!.belowCents);
      expect(bands[i]!.stepCents).toBeGreaterThan(bands[i - 1]!.stepCents);
    }
    expect(bands.at(-1)!.belowCents).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps the radius default inside the slider range", () => {
    const { defaultMiles, minMiles, maxMiles } = marketplaceConfig.radius;
    expect(defaultMiles).toBeGreaterThanOrEqual(minMiles);
    expect(defaultMiles).toBeLessThanOrEqual(maxMiles);
  });

  it("uses a valid default unsold action", () => {
    const valid: UnsoldAction[] = ["relist_once", "drop_to_free", "end"];
    expect(valid).toContain(marketplaceConfig.listings.defaultUnsoldAction);
  });
});
