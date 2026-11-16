import { describe, expect, it } from "vitest";
import { nextStepFor } from "./gates";

const signedOut = { signedIn: false } as const;
const newMember = { signedIn: true, phoneVerified: false } as const;
const verified = { signedIn: true, phoneVerified: true } as const;

describe("nextStepFor", () => {
  it("lets anyone browse with no account", () => {
    expect(nextStepFor("browse", signedOut)).toBe("ok");
    expect(nextStepFor("browse", newMember)).toBe("ok");
  });

  it("asks for an account before listing or bidding", () => {
    expect(nextStepFor("list", signedOut)).toBe("sign-in");
    expect(nextStepFor("bid", signedOut)).toBe("sign-in");
  });

  it("asks for a phone check at the first listing or bid, not at sign-up", () => {
    expect(nextStepFor("browse", newMember)).toBe("ok");
    expect(nextStepFor("list", newMember)).toBe("verify-phone");
    expect(nextStepFor("bid", newMember)).toBe("verify-phone");
  });

  it("lets verified members through", () => {
    expect(nextStepFor("list", verified)).toBe("ok");
    expect(nextStepFor("bid", verified)).toBe("ok");
  });
});
