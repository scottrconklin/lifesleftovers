import { describe, expect, it } from "vitest";
import { safeNextPath, withNext } from "./next-path";

describe("safeNextPath", () => {
  it.each(["/", "/sell", "/account?tab=profile", "/items/42#bids"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "sell",
    "",
    "/\nfoo",
    "/" + "a".repeat(600),
  ])("refuses %j", (path) => {
    expect(safeNextPath(path)).toBe("/");
  });

  it("refuses non-strings and uses the fallback", () => {
    expect(safeNextPath(undefined, "/account")).toBe("/account");
    expect(safeNextPath(["/sell"])).toBe("/");
  });

  it("builds sign-in links with an encoded, sanitized next", () => {
    expect(withNext("/sign-in", "/sell?x=1")).toBe("/sign-in?next=%2Fsell%3Fx%3D1");
    expect(withNext("/sign-in", "https://evil.example")).toBe("/sign-in?next=%2F");
  });
});
