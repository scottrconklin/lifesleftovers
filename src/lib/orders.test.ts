import { describe, expect, it } from "vitest";
import { isStandingOrder, lastPickupWindowEnd, nextDeadline, releaseAfter } from "./orders";

const TZ = "America/Chicago";

describe("lastPickupWindowEnd", () => {
  it("is the latest window's end, in the metro's zone", () => {
    // Closing Night Sun Nov 29, 2026 (CST, UTC-6). Evening ends 8 PM; afternoon ends 5 PM.
    const end = lastPickupWindowEnd(
      "2026-11-29",
      [
        { dayOffset: 2, block: "evening" },
        { dayOffset: 6, block: "afternoon" },
        { dayOffset: 1, block: "morning" },
      ],
      TZ,
    );
    expect(end?.toISOString()).toBe("2026-12-05T23:00:00.000Z"); // Sat Dec 5, 5 PM CST
  });

  it("is null with no windows", () => {
    expect(lastPickupWindowEnd("2026-11-29", [], TZ)).toBeNull();
  });
});

describe("releaseAfter", () => {
  const paidAt = new Date("2026-11-30T01:05:00Z"); // Sun 7:05 PM CST

  it("waits 72 hours past the last pickup window, not just 72 hours past payment", () => {
    const at = releaseAfter({
      paidAt,
      closingNightDate: "2026-11-29",
      pickupWindows: [{ dayOffset: 6, block: "afternoon" }],
      timeZone: TZ,
    });
    expect(at.toISOString()).toBe("2026-12-08T23:00:00.000Z");
  });

  it("counts from payment when it's later than every window (a late second-chance sale)", () => {
    const late = new Date("2026-12-10T12:00:00Z");
    const at = releaseAfter({
      paidAt: late,
      closingNightDate: "2026-11-29",
      pickupWindows: [{ dayOffset: 1, block: "evening" }],
      timeZone: TZ,
    });
    expect(at.toISOString()).toBe("2026-12-13T12:00:00.000Z");
  });

  it("counts from payment with no windows", () => {
    const at = releaseAfter({
      paidAt,
      closingNightDate: "2026-11-29",
      pickupWindows: [],
      timeZone: TZ,
    });
    expect(at.getTime() - paidAt.getTime()).toBe(72 * 60 * 60 * 1000);
  });
});

describe("nextDeadline", () => {
  const due = new Date("2026-12-01T00:00:00Z");
  const base = { paymentDueAt: due, offerExpiresAt: due, releaseAfter: due };

  it("follows the status", () => {
    expect(nextDeadline({ ...base, status: "payment_failed" })).toBe(due);
    expect(nextDeadline({ ...base, status: "offered" })).toBe(due);
    expect(nextDeadline({ ...base, status: "paid" })).toBe(due);
  });

  it("is null while waiting on people or when finished", () => {
    for (const status of [
      "awaiting_payment",
      "claimed",
      "problem_reported",
      "released",
      "refunded",
      "cancelled",
    ] as const) {
      expect(nextDeadline({ ...base, status })).toBeNull();
    }
  });
});

describe("isStandingOrder", () => {
  it("drops cancelled and refunded orders from an auction's result", () => {
    expect(isStandingOrder("paid")).toBe(true);
    expect(isStandingOrder("payment_failed")).toBe(true);
    expect(isStandingOrder("cancelled")).toBe(false);
    expect(isStandingOrder("refunded")).toBe(false);
  });
});
