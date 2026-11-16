import { describe, expect, it } from "vitest";
import { defaultDisplayName, initialsFor, profileFormSchema } from "./profile";

describe("profileFormSchema", () => {
  it("trims the name, collapses spaces and makes a blank zip null", () => {
    expect(profileFormSchema.parse({ displayName: "  Scott   C. ", homeZip: " " })).toEqual({
      displayName: "Scott C.",
      homeZip: null,
    });
  });

  it("accepts a 5-digit zip", () => {
    expect(profileFormSchema.parse({ displayName: "Ana", homeZip: "77494" }).homeZip).toBe("77494");
  });

  it.each([
    [{ displayName: "   ", homeZip: "" }, "Add a name"],
    [{ displayName: "x".repeat(41), homeZip: "" }, "under 40"],
    [{ displayName: "<script>", homeZip: "" }, "< or >"],
    [{ displayName: "Ana", homeZip: "7749" }, "5-digit"],
    [{ displayName: "Ana", homeZip: "77494-1234" }, "5-digit"],
  ])("rejects %j", (input, message) => {
    const result = profileFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });
});

describe("initialsFor", () => {
  it.each([
    ["Scott Conklin", "SC"],
    ["scott r conklin", "SC"],
    ["Cher", "C"],
    ["  ana  ", "A"],
    ["(Bob) Smith", "BS"],
    ["Émile Zola", "ÉZ"],
  ])("%s → %s", (name, expected) => {
    expect(initialsFor(name)).toBe(expected);
  });

  it("falls back to the email's first letter, then ?", () => {
    expect(initialsFor(null, "pat@example.com")).toBe("P");
    expect(initialsFor("", null)).toBe("?");
  });
});

describe("defaultDisplayName", () => {
  it("turns Google's name into First L.", () => {
    expect(defaultDisplayName({ given_name: "Scott", family_name: "Conklin" })).toBe("Scott C.");
    expect(defaultDisplayName({ full_name: "Ana Maria Lopez" })).toBe("Ana L.");
    expect(defaultDisplayName({ name: "Cher" })).toBe("Cher");
  });

  it("leaves email sign-ins without a name", () => {
    expect(defaultDisplayName({})).toBeNull();
    expect(defaultDisplayName(undefined)).toBeNull();
    expect(defaultDisplayName({ email: "scott@example.com" })).toBeNull();
  });
});
