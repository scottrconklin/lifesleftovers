import "server-only";
import type postgres from "postgres";
import { marketplaceConfig } from "@/config/marketplace";
import {
  fastNight,
  nightOn,
  relistNight,
  slotEndsAt,
  type MetroClosingSchedule,
  type NightWindow,
} from "@/lib/closing-schedule";
import { serverEnv } from "@/lib/env";
import { inngest } from "@/inngest/client";

/**
 * Where an auction sits on Closing Night: which night, which minute. Slots are handed out in the
 * order items join a night (Decisions log, Nov 19). With the dev fast clock (FAST_CLOCK=1),
 * nights start minutes from now instead of on Sunday.
 */

type Tx = postgres.TransactionSql;

export type MetroScheduleRow = MetroClosingSchedule & { metroId: string; slotSeconds: number };

export const METRO_SCHEDULE_COLUMNS = `m.id as metro_id, m.time_zone, m.closing_weekday,
  m.closing_starts_at::text as closing_starts_at, m.closing_ends_at::text as closing_ends_at,
  m.closing_slot_seconds`;

export function metroScheduleFromRow(row: {
  metro_id: string;
  time_zone: string;
  closing_weekday: number;
  closing_starts_at: string;
  closing_ends_at: string;
  closing_slot_seconds: number;
}): MetroScheduleRow {
  return {
    metroId: row.metro_id,
    timeZone: row.time_zone,
    closingWeekday: row.closing_weekday,
    closingStartsAt: row.closing_starts_at,
    closingEndsAt: row.closing_ends_at,
    slotSeconds: row.closing_slot_seconds,
  };
}

export function fastClockOn(): boolean {
  return serverEnv().FAST_CLOCK;
}

/** Fast nights still far enough away to join (see `fastNight`). */
async function upcomingFastStarts(tx: Tx, metroId: string, now: Date): Promise<Date[]> {
  const { closingNightStartsInSeconds } = marketplaceConfig.devFastClock;
  const rows = await tx<{ starts_at: Date }[]>`
    select starts_at from public.closing_nights
    where metro_id = ${metroId} and starts_at > ${now}
      and starts_at <= ${new Date(now.getTime() + (closingNightStartsInSeconds + 60) * 1000)}`;
  return rows.map((r) => r.starts_at);
}

/** The night a listing joins: its chosen date, or (fast clock) the next fast night. */
export async function nightForListing(
  tx: Tx,
  schedule: MetroScheduleRow,
  chosenDate: string,
  now: Date,
): Promise<NightWindow> {
  if (!fastClockOn()) return nightOn(chosenDate, schedule);
  return fastNight(now, schedule, await upcomingFastStarts(tx, schedule.metroId, now));
}

/** The night an unsold item relists into: a week later, or (fast clock) the next fast night. */
export async function nightForRelist(
  tx: Tx,
  schedule: MetroScheduleRow,
  lastNightDate: string,
  now: Date,
): Promise<NightWindow> {
  if (!fastClockOn()) return relistNight(lastNightDate, schedule);
  return fastNight(now, schedule, await upcomingFastStarts(tx, schedule.metroId, now));
}

export type Slot = { closingNightId: string; slot: number; endsAt: Date; date: string };

/**
 * Take the next minute on a night, creating the night if it's the first item. One statement, so
 * two listings joining at once can't get the same slot.
 */
export async function claimSlot(
  tx: Tx,
  schedule: MetroScheduleRow,
  night: NightWindow,
): Promise<Slot> {
  const [row] = await tx<{ id: string; slot: number }[]>`
    insert into public.closing_nights (metro_id, date, starts_at, ends_at, next_slot)
    values (${schedule.metroId}, ${night.date}, ${night.startsAt}, ${night.endsAt}, 1)
    on conflict (metro_id, starts_at) do update
      set next_slot = public.closing_nights.next_slot + 1
    returning id, next_slot - 1 as slot`;
  if (!row) throw new Error("claimSlot: no row");
  return {
    closingNightId: row.id,
    slot: row.slot,
    endsAt: slotEndsAt(night, row.slot, schedule.slotSeconds),
    date: night.date,
  };
}

/**
 * Wake the closing job at the auction's end. The event id includes the end time, so moving an
 * auction to an earlier night starts a new timer, while sending the same one twice is a no-op.
 * The once-every-few-minutes sweep closes anything a lost event missed.
 */
export async function scheduleClosing(auctionId: string, endsAt: Date): Promise<void> {
  try {
    await inngest.send({
      id: `auction-scheduled-${auctionId}-${endsAt.getTime()}`,
      name: "auction/scheduled",
      data: { auctionId },
    });
  } catch {
    console.warn(
      "Couldn't schedule closing (is `pnpm jobs:dev` running?); the sweep will catch it",
    );
  }
}
