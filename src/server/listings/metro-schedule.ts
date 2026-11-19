import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { metros } from "@/db/schema";
import { upcomingClosingNights } from "@/lib/closing-night";
import { formatShortDate } from "@/lib/time";

export type MetroSchedule = {
  id: string;
  shortName: string;
  status: "waitlist" | "seeding" | "open";
  timeZone: string;
  closingWeekday: number;
  closingStartsAt: string;
};

export async function metroSchedule(metroId: string): Promise<MetroSchedule | undefined> {
  const [row] = await getDb()
    .select({
      id: metros.id,
      shortName: metros.shortName,
      status: metros.status,
      timeZone: metros.timeZone,
      closingWeekday: metros.closingWeekday,
      closingStartsAt: metros.closingStartsAt,
    })
    .from(metros)
    .where(eq(metros.id, metroId))
    .limit(1);
  return row;
}

/** The Closing Nights a listing can choose, or null while the metro isn't open yet. */
export function closingNightOptions(
  metro: MetroSchedule,
  now = new Date(),
): Array<{ date: string; label: string }> | null {
  if (metro.status !== "open") return null;
  return upcomingClosingNights(now, metro).map((n) => ({
    date: n.date,
    label: formatShortDate(n.date),
  }));
}
