import { formatCents } from "./money";
import { localParts } from "./time";

/**
 * Countdown formats (SPEC "Design additions → Countdown rules"), exactly:
 *   more than 24 hours   "Ends Sun 7:42 PM"            navy
 *   1–24 hours           "5h 12m"                      navy
 *   under 1 hour         "38:15", ticking              tomato
 *   extended             "Extended +2:00"              tomato, briefly highlighted
 *   ended                "Sold $14" / "Second Chance Sunday"   gray
 * Times are computed from the server clock (the client keeps an offset) and shown in the metro's
 * time zone.
 */
export type CountdownTone = "navy" | "tomato" | "gray";
export type Countdown = { text: string; tone: CountdownTone; ticking: boolean };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "7:42 PM" in the metro's zone. */
export function clockTime(at: Date, timeZone: string): string {
  const p = localParts(at, timeZone);
  const hour = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** "Sun 7:42 PM" in the metro's zone. */
export function endsAtLabel(endsAt: Date, timeZone: string): string {
  return `${WEEKDAY[localParts(endsAt, timeZone).weekday]} ${clockTime(endsAt, timeZone)}`;
}

export type CountdownInput = {
  now: Date;
  endsAt: Date;
  timeZone: string;
  /** For the ended state. */
  bidCount: number;
  currentPriceCents: number;
  /** Whether an unsold item comes back next week (relist once / drop to free). */
  relists: boolean;
};

export function countdown(input: CountdownInput): Countdown {
  const left = input.endsAt.getTime() - input.now.getTime();
  if (left <= 0) {
    if (input.bidCount > 0) {
      return { text: `Sold ${formatCents(input.currentPriceCents)}`, tone: "gray", ticking: false };
    }
    if (input.relists) {
      const next = WEEKDAY_LONG[localParts(input.endsAt, input.timeZone).weekday];
      return { text: `Second Chance ${next}`, tone: "gray", ticking: false };
    }
    return { text: "Ended", tone: "gray", ticking: false };
  }
  if (left > DAY) {
    return {
      text: `Ends ${endsAtLabel(input.endsAt, input.timeZone)}`,
      tone: "navy",
      ticking: false,
    };
  }
  if (left >= HOUR) {
    const totalMinutes = Math.floor(left / 60_000);
    return {
      text: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      tone: "navy",
      ticking: false,
    };
  }
  const totalSeconds = Math.ceil(left / 1000);
  return {
    text: `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`,
    tone: "tomato",
    ticking: true,
  };
}

/** "Extended +2:00": shown briefly after a late bid pushes the end out. */
export function extendedLabel(extendedBySeconds: number): string {
  const s = Math.max(0, Math.round(extendedBySeconds));
  return `Extended +${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The item page's big number for more than a day out (mockup Item.dc.html: "2d 14h"). */
export function daysHoursLeft(now: Date, endsAt: Date): string {
  const left = Math.max(0, endsAt.getTime() - now.getTime());
  return `${Math.floor(left / DAY)}d ${Math.floor((left % DAY) / HOUR)}h`;
}
