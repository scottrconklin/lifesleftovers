import { describe, expect, it } from "vitest";
import {
  defaultNight,
  fastNight,
  nightOn,
  relistNight,
  slotEndsAt,
  slotsOn,
} from "./closing-schedule";

const houston = {
  timeZone: "America/Chicago",
  closingWeekday: 0,
  closingStartsAt: "19:00:00",
  closingEndsAt: "21:00:00",
};

describe("Closing Night windows and slots", () => {
  const night = nightOn("2026-11-22", houston);

  it("runs Sunday 7–9 PM Central, stored in UTC", () => {
    expect(night.startsAt.toISOString()).toBe("2026-11-23T01:00:00.000Z");
    expect(night.endsAt.toISOString()).toBe("2026-11-23T03:00:00.000Z");
    expect(slotsOn(night)).toBe(120);
  });

  it("closes one item a minute, 7:00 through 8:59", () => {
    expect(slotEndsAt(night, 0).toISOString()).toBe("2026-11-23T01:00:00.000Z");
    expect(slotEndsAt(night, 42).toISOString()).toBe("2026-11-23T01:42:00.000Z");
    expect(slotEndsAt(night, 119).toISOString()).toBe("2026-11-23T02:59:00.000Z");
  });

  it("past 120 items, shares minutes instead of running past 9 PM", () => {
    expect(slotEndsAt(night, 120).toISOString()).toBe(slotEndsAt(night, 0).toISOString());
    expect(slotEndsAt(night, 250).getTime()).toBeLessThan(night.endsAt.getTime());
  });

  it("defaults new listings to the next Sunday at least 3 days out", () => {
    expect(defaultNight(new Date("2026-11-19T18:00:00Z"), houston).date).toBe("2026-11-22");
    expect(defaultNight(new Date("2026-11-20T18:00:00Z"), houston).date).toBe("2026-11-29");
  });

  it("relists into the same weekday a week later", () => {
    expect(relistNight("2026-11-22", houston)).toEqual(nightOn("2026-11-29", houston));
  });
});

describe("dev fast clock", () => {
  const now = new Date("2026-11-20T15:03:20Z");

  it("starts a Closing Night about 10 minutes out, on a whole minute", () => {
    const night = fastNight(now, houston, []);
    expect(night.startsAt.toISOString()).toBe("2026-11-20T15:14:00.000Z");
    expect(night.endsAt.getTime() - night.startsAt.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it("joins an existing fast night while it's at least 5 minutes away", () => {
    const soon = new Date("2026-11-20T15:09:00Z"); // 5m40s away
    const tooSoon = new Date("2026-11-20T15:06:00Z"); // 2m40s away
    expect(fastNight(now, houston, [tooSoon, soon]).startsAt).toEqual(soon);
    expect(fastNight(now, houston, [tooSoon]).startsAt.toISOString()).toBe(
      "2026-11-20T15:14:00.000Z",
    );
  });
});
