import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { MetroSummary } from "@/server/geo/places";
import { WaitlistForm } from "./WaitlistForm";

/**
 * "City not open yet" (mockup NotOpen.dc.html). Shown instead of an empty wall to anyone whose
 * location is in a waitlist or seeding metro, or outside every metro. The "See how it works"
 * preview of live Houston auctions joins this screen once listings exist (M3).
 */
export function NotOpenScreen({
  metro,
  zip,
  waitingCount,
  listingCount,
  signedIn,
  turnstileSiteKey,
}: {
  metro: MetroSummary | null;
  zip: string;
  waitingCount: number;
  /** Listings saved for this metro's first Closing Night. */
  listingCount: number;
  signedIn: boolean;
  turnstileSiteKey: string | null;
}) {
  const placeName = metro?.shortName ?? "your area";
  const percent = metro
    ? Math.min(100, Math.round((listingCount / Math.max(1, metro.listingsToOpen)) * 100))
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <NeighborhoodIllustration />

      <div>
        <h1 className="font-display text-[26px] leading-tight font-extrabold text-brand-navy">
          {metro ? `${metro.shortName} isn't open yet` : "We're not in your area yet"}
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-brand-navy">
          {metro
            ? `Your neighbors are lining up. List now and your items go live on ${metro.shortName}'s first Closing Night.`
            : "Life's Leftovers is starting in Houston. Leave your email and we'll tell you when your area opens."}
        </p>
      </div>

      {metro ? (
        <section aria-labelledby="progress" className="rounded-xl bg-white px-4 py-3.5">
          <h2 id="progress" className="text-[15px] font-bold text-brand-navy">
            {waitingCount === 0
              ? "Be the first neighbor on the list"
              : `${waitingCount} ${waitingCount === 1 ? "neighbor" : "neighbors"} waiting`}
          </h2>
          <div className="mt-2.5 flex justify-between text-[13px] text-brand-navy">
            <span>Listings to open</span>
            <strong>
              {listingCount} of {metro.listingsToOpen}
            </strong>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={metro.listingsToOpen}
            aria-valuenow={listingCount}
            aria-label={`Listings to open ${metro.shortName}`}
            className="mt-1.5 h-3 overflow-hidden rounded-md bg-brand-sand"
          >
            <div className="h-full bg-brand-mustard" style={{ width: `${percent}%` }} />
          </div>
        </section>
      ) : null}

      {metro ? (
        <Link href="/sell" className={buttonVariants({ size: "lg", className: "h-13.5 text-lg" })}>
          List anyway
        </Link>
      ) : null}

      <WaitlistForm
        placeName={placeName}
        metroSlug={metro?.slug ?? null}
        zip={zip}
        signedIn={signedIn}
        turnstileSiteKey={turnstileSiteKey}
      />
    </main>
  );
}

/**
 * Placeholder spot illustration until the custom set exists (SPEC "Design on a budget"): a row of
 * houses under a mustard sun. Flat roofs only: no slanted elements (brand rule).
 */
function NeighborhoodIllustration() {
  return (
    <div className="flex h-30 items-end justify-center overflow-hidden rounded-2xl bg-brand-sand">
      <svg viewBox="0 0 320 120" className="h-full w-full max-w-80" aria-hidden="true">
        <circle cx="250" cy="38" r="20" fill="#F5B82E" />
        {[
          { x: 40, w: 56, h: 46 },
          { x: 108, w: 44, h: 62 },
          { x: 164, w: 60, h: 40 },
          { x: 236, w: 46, h: 54 },
        ].map((house) => (
          <g key={house.x}>
            <rect
              x={house.x}
              y={120 - house.h}
              width={house.w}
              height={house.h}
              rx="3"
              fill="#FFFFFF"
              stroke="#1B385B"
              strokeWidth="3"
            />
            <rect
              x={house.x + house.w / 2 - 7}
              y={120 - 22}
              width="14"
              height="22"
              fill="#D94B35"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
