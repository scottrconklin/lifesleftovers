import { describe, expect, it } from "vitest";
import { chooseRadius, clampRadius, radiusNotice } from "./radius";

describe("clampRadius", () => {
  it("defaults to 15 miles", () => {
    expect(clampRadius(undefined)).toBe(15);
    expect(clampRadius("abc")).toBe(15);
  });

  it("keeps the slider's 5–50 range in 5-mile steps", () => {
    expect(clampRadius(2)).toBe(5);
    expect(clampRadius(80)).toBe(50);
    expect(clampRadius("27")).toBe(25);
    expect(clampRadius(28)).toBe(30);
  });
});

/** n results at the given distance. */
const at = (miles: number, n: number) => Array.from({ length: n }, () => miles);

describe("chooseRadius (auto-widen below 12 results)", () => {
  it("keeps the requested radius when it has 12 or more", () => {
    const choice = chooseRadius([...at(3, 12), ...at(30, 5)], 15);
    expect(choice).toEqual({
      radiusMiles: 15,
      requestedMiles: 15,
      widened: false,
      count: 12,
      countAtRequested: 12,
    });
  });

  it("widens in 5-mile steps to the first radius with 12", () => {
    const choice = chooseRadius([...at(4, 4), ...at(27, 19)], 15);
    expect(choice.radiusMiles).toBe(30);
    expect(choice.widened).toBe(true);
    expect(choice.count).toBe(23);
    expect(choice.countAtRequested).toBe(4);
  });

  it("stops at 50 miles and shows what's there", () => {
    const choice = chooseRadius([...at(2, 3), ...at(45, 4), ...at(70, 30)], 15);
    expect(choice.radiusMiles).toBe(50);
    expect(choice.count).toBe(7);
  });

  it("doesn't widen when widening adds nothing", () => {
    const choice = chooseRadius(at(2, 3), 15);
    expect(choice.widened).toBe(false);
    expect(choice.radiusMiles).toBe(15);
  });

  it("counts results exactly on the edge", () => {
    expect(chooseRadius(at(15, 12), 15).widened).toBe(false);
  });
});

describe("radiusNotice", () => {
  it("says so when it widened", () => {
    expect(radiusNotice(chooseRadius([...at(4, 4), ...at(27, 19)], 15))).toEqual({
      tone: "info",
      text: "Showing 23 auctions within 30 miles",
    });
  });

  it("uses the singular for one", () => {
    expect(radiusNotice(chooseRadius(at(40, 1), 15))?.text).toBe(
      "Showing 1 auction within 50 miles",
    );
  });

  it("never shows a bare zero", () => {
    expect(radiusNotice(chooseRadius([], 15))).toEqual({
      tone: "empty",
      text: "Nothing near you yet. Widen your radius?",
    });
  });

  it("stays quiet when the requested radius was enough", () => {
    expect(radiusNotice(chooseRadius(at(1, 20), 15))).toBeNull();
  });
});
