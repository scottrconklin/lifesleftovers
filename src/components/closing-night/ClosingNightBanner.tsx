import Link from "next/link";
import { endsAtLabel } from "@/lib/countdown";

/**
 * The mustard Closing Night banner on the wall (navy text on mustard, ~6.7:1). Links to the live
 * view. The full countdown banner arrives with the wall in M8.
 */
export function ClosingNightBanner({
  startsAt,
  timeZone,
  now,
}: {
  startsAt: Date;
  timeZone: string;
  now: Date;
}) {
  const live = now >= startsAt;
  return (
    <Link
      href="/closing-night"
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl bg-brand-mustard px-4 py-2.5 text-left font-bold text-brand-navy"
    >
      <span>
        {live ? "Closing Night is live now" : `Closing Night · ${endsAtLabel(startsAt, timeZone)}`}
      </span>
      <span className="text-sm underline underline-offset-2">
        {live ? "Watch it live" : "See the lineup"}
      </span>
    </Link>
  );
}
