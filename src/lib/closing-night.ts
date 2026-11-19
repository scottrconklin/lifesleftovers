import { marketplaceConfig } from "@/config/marketplace";
import { addDays, localParts, zonedTimeToUtc } from "./time";

export type ClosingSchedule = {
  timeZone: string;
  /** 0 = Sunday. */
  closingWeekday: number;
  /** "19:00" or "19:00:00", metro-local. */
  closingStartsAt: string;
};

export type ClosingNight = { date: string; startsAt: Date };

/**
 * The next Closing Nights a new listing can join: the metro's weekday at its start time, at least
 * `minDaysBeforeClosingNight` (3) days from now (SPEC: "defaults to the next one at least 3 days
 * out"). The first is the default.
 */
export function upcomingClosingNights(
  now: Date,
  schedule: ClosingSchedule,
  count = 2,
  minDays: number = marketplaceConfig.closingNight.minDaysBeforeClosingNight,
): ClosingNight[] {
  const today = localParts(now, schedule.timeZone);
  let date = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  date = addDays(date, (schedule.closingWeekday - today.weekday + 7) % 7);
  const earliest = now.getTime() + minDays * 24 * 60 * 60 * 1000;
  const time = schedule.closingStartsAt.slice(0, 5);
  const nights: ClosingNight[] = [];
  while (nights.length < count) {
    const startsAt = zonedTimeToUtc(date, time, schedule.timeZone);
    if (startsAt.getTime() >= earliest) nights.push({ date, startsAt });
    date = addDays(date, 7);
  }
  return nights;
}
