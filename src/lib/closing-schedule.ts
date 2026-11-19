import { marketplaceConfig } from "@/config/marketplace";
import { upcomingClosingNights, type ClosingSchedule } from "./closing-night";
import { addDays, localDate, zonedTimeToUtc } from "./time";

/**
 * When a Closing Night runs and when each item on it closes (SPEC: "Every auction in a metro ends
 * on Sunday between 7 and 9 pm, one item per minute").
 */
export type NightWindow = { date: string; startsAt: Date; endsAt: Date };
export type MetroClosingSchedule = ClosingSchedule & { closingEndsAt: string };

const { slotIntervalSeconds, relistAfterDays } = marketplaceConfig.closingNight;
const { closingNightStartsInSeconds, auctionDurationSeconds } = marketplaceConfig.devFastClock;

/** The window of the Closing Night on a given local date. */
export function nightOn(date: string, schedule: MetroClosingSchedule): NightWindow {
  return {
    date,
    startsAt: zonedTimeToUtc(date, schedule.closingStartsAt.slice(0, 5), schedule.timeZone),
    endsAt: zonedTimeToUtc(date, schedule.closingEndsAt.slice(0, 5), schedule.timeZone),
  };
}

/** Minutes on a night: 7–9 PM is 120. */
export function slotsOn(
  night: { startsAt: Date; endsAt: Date },
  slotSeconds: number = slotIntervalSeconds,
): number {
  return Math.max(
    1,
    Math.floor((night.endsAt.getTime() - night.startsAt.getTime()) / (slotSeconds * 1000)),
  );
}

/**
 * When the item in `slot` closes: 7:00, 7:01 … 8:59. Past the last minute, items share minutes
 * from the top again (121st with the 1st) rather than running past the window.
 */
export function slotEndsAt(
  night: { startsAt: Date; endsAt: Date },
  slot: number,
  slotSeconds: number = slotIntervalSeconds,
): Date {
  const minute = slot % slotsOn(night, slotSeconds);
  return new Date(night.startsAt.getTime() + minute * slotSeconds * 1000);
}

/** The Closing Night a new listing joins by default: the next one at least 3 days out. */
export function defaultNight(now: Date, schedule: MetroClosingSchedule): NightWindow {
  const [next] = upcomingClosingNights(now, schedule, 1);
  return nightOn(next!.date, schedule);
}

/** Where an unsold item relists: the same weekday a week later ("next week's Closing Night"). */
export function relistNight(lastNightDate: string, schedule: MetroClosingSchedule): NightWindow {
  return nightOn(addDays(lastNightDate, relistAfterDays), schedule);
}

/**
 * Dev fast clock (FAST_CLOCK=1): a listing joins the earliest existing fast night that's still at
 * least 5 minutes away, else a new one starting 10 minutes from now (on the next whole minute).
 * Fast nights keep the real window length, one item a minute.
 */
export function fastNight(
  now: Date,
  schedule: MetroClosingSchedule,
  existingStarts: readonly Date[],
): NightWindow {
  const length = nightOn("2026-01-04", schedule);
  const windowMs = length.endsAt.getTime() - length.startsAt.getTime();
  const joinable = existingStarts
    .filter((s) => s.getTime() - now.getTime() >= auctionDurationSeconds * 1000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const minute = 60_000;
  const startsAt =
    joinable ??
    new Date(Math.ceil((now.getTime() + closingNightStartsInSeconds * 1000) / minute) * minute);
  return {
    date: localDate(startsAt, schedule.timeZone),
    startsAt,
    endsAt: new Date(startsAt.getTime() + windowMs),
  };
}
