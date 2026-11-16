import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./errors";

describe("signInErrorMessage", () => {
  it("explains common failures in plain words", () => {
    expect(signInErrorMessage({ code: "captcha_failed" })).toMatch(/bot check/);
    expect(signInErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/Too many tries/);
    expect(signInErrorMessage({ code: "otp_expired" })).toMatch(/expired/);
    expect(signInErrorMessage({ status: 429 })).toMatch(/Too many tries/);
  });

  it("never leaks raw error text", () => {
    expect(signInErrorMessage({ code: "unexpected_failure" })).toBe(
      "Something went wrong on our end. Please try again.",
    );
    expect(signInErrorMessage(null)).toMatch(/Something went wrong/);
  });
});
