import { describe, expect, it } from "vitest";
import { upcomingClosingNights } from "./closing-night";
import { addDays, formatShortDate, localDate, zonedTimeToUtc } from "./time";

const houston = { timeZone: "America/Chicago", closingWeekday: 0, closingStartsAt: "19:00:00" };

describe("time helpers", () => {
  it("converts Houston wall-clock time to UTC on both sides of daylight saving", () => {
    // CDT (UTC-5) before Nov 1, 2026; CST (UTC-6) after.
    expect(zonedTimeToUtc("2026-10-25", "19:00", "America/Chicago").toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-11-29", "19:00", "America/Chicago").toISOString()).toBe(
      "2026-11-30T01:00:00.000Z",
    );
  });

  it("reads the local date in the metro's zone, not UTC", () => {
    // 03:00 UTC Monday is still Sunday evening in Houston.
    expect(localDate(new Date("2026-11-23T03:00:00Z"), "America/Chicago")).toBe("2026-11-22");
  });

  it("adds days and formats short dates", () => {
    expect(addDays("2026-11-29", 7)).toBe("2026-12-06");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(formatShortDate("2026-11-29")).toBe("Sun, Nov 29");
  });
});

describe("upcomingClosingNights", () => {
  it("defaults to the next Sunday at least 3 days out", () => {
    // Thursday Nov 19, noon in Houston: Sunday Nov 22 is 3 days 7 hours away.
    const nights = upcomingClosingNights(new Date("2026-11-19T18:00:00Z"), houston);
    expect(nights.map((n) => n.date)).toEqual(["2026-11-22", "2026-11-29"]);
    expect(nights[0]?.startsAt.toISOString()).toBe("2026-11-23T01:00:00.000Z");
  });

  it("skips a Closing Night that's less than 3 days away", () => {
    // Friday Nov 20, noon: Sunday Nov 22 at 7 PM is only 2 days 7 hours away.
    const nights = upcomingClosingNights(new Date("2026-11-20T18:00:00Z"), houston);
    expect(nights.map((n) => n.date)).toEqual(["2026-11-29", "2026-12-06"]);
  });

  it("treats Sunday evening after Closing Night started as the next week", () => {
    const nights = upcomingClosingNights(new Date("2026-11-23T02:00:00Z"), houston); // Sun 8 PM
    expect(nights[0]?.date).toBe("2026-11-29");
  });

  it("follows each metro's own weekday", () => {
    const saturday = { ...houston, closingWeekday: 6 };
    const nights = upcomingClosingNights(new Date("2026-11-16T18:00:00Z"), saturday, 1); // Mon
    expect(nights[0]?.date).toBe("2026-11-21");
  });
});
