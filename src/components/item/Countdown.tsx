"use client";

import { cn } from "cn";
import { marketplaceConfig } from "@/config/marketplace";
import { countdown, daysHoursLeft, extendedLabel } from "@/lib/countdown";
import { useServerNow } from "@/lib/client/use-server-clock";

const TONE = {
  navy: "text-brand-navy",
  tomato: "text-brand-tomato-strong",
  gray: "text-brand-ink-muted",
} as const;

/**
 * Live countdown in the SPEC formats, from the server clock. Before hydration it shows what the
 * server rendered (`initialText`), so there's no flash. `big` is the item page's large number,
 * which shows "2d 14h" more than a day out (mockup Item.dc.html).
 */
export function Countdown({
  endsAt,
  scheduledEndsAt,
  timeZone,
  bidCount,
  currentPriceCents,
  relists,
  initialText,
  big = false,
  className,
}: {
  endsAt: string;
  scheduledEndsAt: string;
  timeZone: string;
  bidCount: number;
  currentPriceCents: number;
  relists: boolean;
  initialText: string;
  big?: boolean;
  className?: string;
}) {
  const now = useServerNow();
  if (!now) return <span className={cn(TONE.navy, className)}>{initialText}</span>;

  const ends = new Date(endsAt);
  const c = countdown({ now, endsAt: ends, timeZone, bidCount, currentPriceCents, relists });
  // Extended by a late bid: "Extended +2:00" (the soft-close rule), tomato, briefly highlighted.
  const showExtended = c.ticking && ends.getTime() > new Date(scheduledEndsAt).getTime();
  const text =
    big && c.tone === "navy" && c.text.startsWith("Ends ") ? daysHoursLeft(now, ends) : c.text;

  return (
    <span className={cn("tabular-nums", TONE[c.tone], className)}>
      {/* Countdowns don't animate beyond ticking, so reduced motion needs nothing extra. */}
      <span role={c.ticking ? "timer" : undefined} aria-live="off">
        {text}
      </span>
      {showExtended ? (
        <span
          key={endsAt}
          className="ml-2 inline-block animate-[ll-flash_1.2s_ease-out] rounded bg-brand-tomato-strong/10 px-1.5 text-sm font-bold text-brand-tomato-strong motion-reduce:animate-none"
        >
          {extendedLabel(marketplaceConfig.softClose.extendToSeconds)}
        </span>
      ) : null}
    </span>
  );
}
