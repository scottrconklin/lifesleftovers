import { describe, expect, it } from "vitest";
import { formatUsPhone, maskPhone, normalizeUsPhone } from "./phone";

describe("normalizeUsPhone", () => {
  it.each([
    ["(713) 555-0123", "+17135550123"],
    ["713.555.0123", "+17135550123"],
    ["7135550123", "+17135550123"],
    ["+1 713 555 0123", "+17135550123"],
    ["1-713-555-0123", "+17135550123"],
    ["  832 555 9999 ", "+18325559999"],
  ])("accepts %s", (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["555-0123", "too short"],
    ["+44 20 7946 0958", "not a US number"],
    ["+52 55 1234 5678", "Mexico"],
    ["(013) 555-0123", "area code starts with 0"],
    ["(713) 155-0123", "exchange starts with 1"],
    ["(911) 555-0123", "N11 service code"],
    ["1-800-FLOWERS", "letters"],
    ["713555012345", "too long"],
  ])("rejects %s (%s)", (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
  });
});

describe("formatUsPhone / maskPhone", () => {
  it("formats E.164 for display", () => {
    expect(formatUsPhone("+17135550123")).toBe("(713) 555-0123");
  });

  it("masks all but the last four digits", () => {
    expect(maskPhone("+17135550123")).toBe("(•••) •••-0123");
    expect(maskPhone("+17135550123")).not.toContain("713");
  });
});
