import { describe, expect, it } from "vitest";
import { scrubEvent, scrubText } from "./scrub";

describe("scrubText", () => {
  it.each([
    ["Contact jane.doe@example.com now", "Contact [email] now"],
    ["Call 713-555-0142 or (281) 555 0199", "Call [phone] or [phone]"],
    ["card 4242 4242 4242 4242 declined", "card [card] declined"],
    ["key sk_test_51Habc123 leaked", "key [stripe-key] leaked"],
    ["Authorization: Bearer abc.def-ghi", "Authorization: Bearer [token]"],
  ])("%s", (input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("leaves ordinary text and prices alone", () => {
    expect(scrubText("Outbid on auction 1234 at $14.50")).toBe("Outbid on auction 1234 at $14.50");
  });
});

describe("scrubEvent", () => {
  it("drops cookies, bodies, sensitive headers, extra data and user details except id", () => {
    const event = scrubEvent({
      message: "failed for 713-555-0142",
      request: {
        cookies: { sb: "token" },
        data: { address: "123 Main St" },
        query_string: "phone=7135550142",
        headers: { Authorization: "Bearer x", "User-Agent": "ua", "Stripe-Signature": "t=1" },
      },
      user: { id: "u_1", email: "a@b.co", ip_address: "1.2.3.4" },
      exception: { values: [{ value: "bad email a@b.co" }] },
      breadcrumbs: [{ message: "sent to a@b.co", data: { phone: "7135550142" } }],
      extra: { secret: "x" },
    });
    expect(event.message).toBe("failed for [phone]");
    expect(event.request).toEqual({ headers: { "User-Agent": "ua" } });
    expect(event.user).toEqual({ id: "u_1" });
    expect(event.exception?.values?.[0]?.value).toBe("bad email [email]");
    expect(event.breadcrumbs).toEqual([{ message: "sent to [email]" }]);
    expect(event.extra).toBeUndefined();
  });
});
