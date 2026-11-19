import { describe, expect, it } from "vitest";
import { distanceLabel, formatMiles, roundMiles } from "./distance";

describe("distance display", () => {
  it("rounds meters to whole miles", () => {
    expect(roundMiles(12_874)).toBe(8); // 8.0 mi
    expect(roundMiles(13_700)).toBe(9); // 8.51 mi
    expect(roundMiles(0)).toBe(0);
  });

  it("formats miles for cards", () => {
    expect(formatMiles(8)).toBe("8 mi");
    expect(formatMiles(0)).toBe("Under 1 mi");
    expect(distanceLabel(8, "Katy")).toBe("8 mi · Katy");
    expect(distanceLabel(3, null)).toBe("3 mi");
  });
});
