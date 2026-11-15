import { describe, expect, it } from "vitest";
import { bidIncrementCents, buyerPremiumCents, formatCents } from "./money";

describe("bidIncrementCents", () => {
  it.each([
    [0, 100],
    [100, 100],
    [1999, 100],
    [2000, 200], // "$2 under $100" starts at exactly $20
    [9999, 200],
    [10000, 500], // "$5 above" starts at exactly $100
    [250000, 500],
  ])("price %i¢ → step %i¢", (price, step) => {
    expect(bidIncrementCents(price)).toBe(step);
  });

  it("rejects non-integer or negative cents", () => {
    expect(() => bidIncrementCents(1.5)).toThrow(RangeError);
    expect(() => bidIncrementCents(-100)).toThrow(RangeError);
  });
});

describe("buyerPremiumCents", () => {
  it.each([
    [100, 100], // $1 → 10¢, raised to the $1 minimum
    [800, 100], // the spec's bid-sheet example: $8 + $1 = $9
    [1000, 100],
    [1400, 140], // $14 → $1.40 (nearest cent, not whole dollars)
    [2500, 250], // the spec's $25 example: buyer pays $27.50
    [1005, 101], // 100.5¢ rounds half up
    [1004, 100],
    [12345, 1235], // 1234.5¢ rounds half up
  ])("price %i¢ → premium %i¢", (price, premium) => {
    expect(buyerPremiumCents(price)).toBe(premium);
  });

  it("charges nothing on free items", () => {
    expect(buyerPremiumCents(0, { isFreeItem: true })).toBe(0);
  });

  it("rejects floats", () => {
    expect(() => buyerPremiumCents(14.0001)).toThrow(RangeError);
  });
});

describe("formatCents", () => {
  it("shows whole dollars without decimals and other amounts with cents", () => {
    expect(formatCents(700)).toBe("$7");
    expect(formatCents(140)).toBe("$1.40");
    expect(formatCents(1540)).toBe("$15.40");
    expect(formatCents(250000)).toBe("$2,500");
    expect(formatCents(0)).toBe("$0");
  });
});
