import { describe, expect, it } from "vitest";
import { countdown, daysHoursLeft, endsAtLabel, extendedLabel } from "./countdown";

const tz = "America/Chicago";
const endsAt = new Date("2026-11-23T01:42:00Z"); // Sun Nov 22, 7:42 PM CST
const base = { endsAt, timeZone: tz, bidCount: 0, currentPriceCents: 100, relists: true };
const before = (ms: number) => new Date(endsAt.getTime() - ms);

describe("countdown formats (SPEC countdown rules)", () => {
  it("more than 24 hours: 'Ends Sun 7:42 PM', navy", () => {
    expect(countdown({ ...base, now: before(3 * 86_400_000) })).toEqual({
      text: "Ends Sun 7:42 PM",
      tone: "navy",
      ticking: false,
    });
  });

  it("1–24 hours: '5h 12m', navy", () => {
    expect(countdown({ ...base, now: before((5 * 60 + 12) * 60_000 + 30_000) })).toEqual({
      text: "5h 12m",
      tone: "navy",
      ticking: false,
    });
    expect(countdown({ ...base, now: before(86_400_000) }).text).toBe("24h 0m");
    expect(countdown({ ...base, now: before(3_600_000) }).text).toBe("1h 0m");
  });

  it("under an hour: '38:15', tomato and ticking", () => {
    expect(countdown({ ...base, now: before((38 * 60 + 15) * 1000) })).toEqual({
      text: "38:15",
      tone: "tomato",
      ticking: true,
    });
    expect(countdown({ ...base, now: before(5_000) }).text).toBe("0:05");
    expect(countdown({ ...base, now: before(59 * 60_000 + 59_500) }).text).toBe("60:00");
  });

  it("ended with bids: 'Sold $14', gray", () => {
    expect(countdown({ ...base, now: endsAt, bidCount: 5, currentPriceCents: 1400 })).toEqual({
      text: "Sold $14",
      tone: "gray",
      ticking: false,
    });
  });

  it("ended with no bids: 'Second Chance Sunday' when it relists, else 'Ended'", () => {
    expect(countdown({ ...base, now: endsAt }).text).toBe("Second Chance Sunday");
    expect(countdown({ ...base, now: endsAt, relists: false }).text).toBe("Ended");
  });

  it("formats an extension and the item page's day count", () => {
    expect(extendedLabel(120)).toBe("Extended +2:00");
    expect(extendedLabel(95)).toBe("Extended +1:35");
    expect(daysHoursLeft(before((2 * 24 + 14) * 3_600_000 + 60_000), endsAt)).toBe("2d 14h");
  });

  it("shows times in the metro's zone, morning and noon included", () => {
    expect(endsAtLabel(new Date("2026-11-22T15:05:00Z"), tz)).toBe("Sun 9:05 AM");
    expect(endsAtLabel(new Date("2026-11-22T18:00:00Z"), tz)).toBe("Sun 12:00 PM");
  });
});
