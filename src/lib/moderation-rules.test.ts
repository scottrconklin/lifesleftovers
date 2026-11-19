import { describe, expect, it } from "vitest";
import { keywordModeration } from "./moderation-rules";

describe("keywordModeration", () => {
  it.each([
    ["Hunting rifle with scope", "Weapons or ammunition"],
    ["Box of 9mm ammo", "Weapons or ammunition"],
    ["Juul vape and pods", "Tobacco or vapes"],
    ["Graco car seat, barely used", "Recalled or unsafe kids' gear"],
    ["Replica Rolex watch", "Counterfeits"],
    ["Free puppies to a good home", "Live animals"],
    ["Bottle of bourbon, sealed", "Alcohol"],
    ["Text me at 713-555-0123", "Contact details or off-platform payment"],
    ["Pay with Venmo before pickup", "Contact details or off-platform payment"],
  ])("flags %j", (text, reason) => {
    const result = keywordModeration(text);
    expect(result.verdict).toBe("flagged");
    expect(result.reasons).toContain(reason);
  });

  it.each([
    "Vintage red metal toolbox",
    "Wine glasses, set of 6",
    "Beer stein from Oktoberfest",
    "Kids' bike with training wheels",
    "Hot glue gun and craft supplies",
    "Ryobi nail gun with case",
    "Heat gun for stripping paint",
    "Nerf gun bundle",
    "3 bags of cheer and lacrosse uniforms",
  ])("passes %j", (text) => {
    expect(keywordModeration(text)).toEqual({ verdict: "ok", reasons: [] });
  });

  it("still flags a gun that isn't a tool or toy", () => {
    expect(keywordModeration("Gun safe with a gun inside").verdict).toBe("flagged");
  });
});
