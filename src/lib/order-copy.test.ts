import { describe, expect, it } from "vitest";
import { dateTimeLabel, declineMessage, orderStatusLine } from "./order-copy";
import type { OrderStatus } from "./orders";

const STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "claimed",
  "offered",
  "payment_failed",
  "paid",
  "problem_reported",
  "released",
  "refunded",
  "cancelled",
];

describe("order copy", () => {
  it("formats deadlines in the metro's zone", () => {
    expect(dateTimeLabel(new Date("2026-12-01T01:05:00Z"), "America/Chicago")).toBe(
      "Mon, Nov 30 at 7:05 PM",
    );
  });

  it("explains declines plainly", () => {
    expect(declineMessage("insufficient_funds")).toMatch(/insufficient funds/);
    expect(declineMessage("no_card")).toMatch(/no card/);
    expect(declineMessage("something_new")).toBe("Your card was declined.");
    expect(declineMessage(null)).toBe("Your card was declined.");
  });

  it("has a line for every status, for both sides, and never says escrow", () => {
    for (const role of ["buyer", "seller"] as const) {
      for (const status of STATUSES) {
        const line = orderStatusLine(role, status);
        expect(line.length).toBeGreaterThan(0);
        expect(line.toLowerCase()).not.toContain("escrow");
      }
    }
    expect(orderStatusLine("seller", "released", { transferred: true })).toBe("Paid to you");
  });
});
