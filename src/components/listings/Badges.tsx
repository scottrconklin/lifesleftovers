/**
 * Card badges (SPEC "Design additions"): one small set, square corners, horizontal, at most two
 * per card. Colors pair with words, never color alone.
 */
export function ListingBadges({
  isFree,
  isLot,
  lotItemCount,
  secondChance = false,
}: {
  isFree: boolean;
  isLot: boolean;
  lotItemCount: number | null;
  /** A relisted run: "Second Chance" (navy outline on cream). */
  secondChance?: boolean;
}) {
  const badges: Array<{ key: string; label: string; className: string }> = [];
  if (isLot) {
    badges.push({
      key: "lot",
      label: lotItemCount ? `LOT · ${lotItemCount} items` : "LOT",
      className: "border border-brand-navy text-brand-navy",
    });
  }
  if (isFree) badges.push({ key: "free", label: "FREE", className: "bg-brand-avocado text-white" });
  if (secondChance) {
    badges.push({
      key: "second",
      label: "SECOND CHANCE",
      className: "border border-brand-navy bg-brand-cream text-brand-navy",
    });
  }
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.slice(0, 2).map((b) => (
        <span
          key={b.key}
          className={`px-1.5 py-0.5 text-[11px] leading-none font-bold tracking-wide ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </span>
  );
}
