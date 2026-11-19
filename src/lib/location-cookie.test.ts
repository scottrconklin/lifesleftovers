import { describe, expect, it } from "vitest";
import { parseLocation, serializeLocation } from "./location-cookie";

describe("location cookie", () => {
  it("round-trips a zip and radius", () => {
    expect(parseLocation(serializeLocation({ zip: "77494", radiusMiles: 25 }))).toEqual({
      zip: "77494",
      radiusMiles: 25,
    });
  });

  it("clamps the radius to the slider", () => {
    expect(serializeLocation({ zip: "77494", radiusMiles: 300 })).toBe("77494:50");
    expect(parseLocation("77494:3")).toEqual({ zip: "77494", radiusMiles: 5 });
  });

  it("ignores anything malformed", () => {
    for (const bad of [undefined, "", "7749:15", "77494", "77494:x", "29.7,-95.3:15"]) {
      expect(parseLocation(bad)).toBeNull();
    }
  });
});
