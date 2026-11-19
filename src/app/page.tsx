import { Suspense } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { ClosingNightBanner } from "@/components/closing-night/ClosingNightBanner";
import { ListingCard } from "@/components/listings/ListingCard";
import { BrowsingNear } from "@/components/location/BrowsingNear";
import { LocationPicker } from "@/components/location/LocationPicker";
import { NotOpenScreen } from "@/components/not-open/NotOpenScreen";
import { CardSkeleton } from "@/components/PageCard";
import { chooseRadius } from "@/lib/radius";
import { nextClosingNightStart } from "@/server/auctions/closing-night-view";
import { getViewer } from "@/server/auth/session";
import { waitlistCount } from "@/server/geo/places";
import { getViewerLocation, type ViewerLocation } from "@/server/geo/viewer-location";
import { liveListingCount, nearbyLiveListings } from "@/server/listings/repo";

// Placeholder home until the landing page and the wall (Milestone 8). It already routes people by
// location: pick a location, browse an open metro, or see the "not open yet" screen.
export default function Home() {
  return (
    <Suspense
      fallback={
        <HomeShell>
          <div className="w-full max-w-md">
            <CardSkeleton lines={3} />
          </div>
        </HomeShell>
      }
    >
      <HomeContent />
    </Suspense>
  );
}

function HomeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-304 flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <h1>
        <BrandLogo />
      </h1>
      <p className="font-display text-xl font-bold text-brand-navy">
        Too good to toss. Not worth shipping.
      </p>
      <p className="max-w-md text-brand-ink-muted">
        Local auctions for the stuff in your garage, closet and basement. Every auction ends on
        Sunday&apos;s Closing Night, and you pick it up nearby.
      </p>
      {children}
    </main>
  );
}

async function HomeContent() {
  const location = await getViewerLocation();
  if (!location) {
    return (
      <HomeShell>
        <LocationPicker />
      </HomeShell>
    );
  }
  const metro = location.place.metro;
  if (!metro || metro.status !== "open") return <NotOpenHere location={location} />;

  // Radius search: every live auction within 50 mi, then the radius to show (auto-widen).
  const [nearby, nightStart] = await Promise.all([
    nearbyLiveListings(location.zip, metro.id),
    nextClosingNightStart(metro.id),
  ]);
  const choice = chooseRadius(
    nearby.map((n) => n.miles),
    location.radiusMiles,
  );
  const shown = nearby.filter((n) => n.miles <= choice.radiusMiles);
  const now = new Date();
  return (
    <HomeShell>
      {nightStart ? (
        <ClosingNightBanner startsAt={nightStart} timeZone={metro.timeZone} now={now} />
      ) : null}
      <BrowsingNear location={location} choice={choice} />
      {shown.length > 0 ? (
        <ul
          aria-label="Auctions near you"
          className="grid w-full grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
        >
          {shown.map((listing) => (
            <ListingCard key={listing.id} listing={listing} now={now} />
          ))}
        </ul>
      ) : null}
    </HomeShell>
  );
}

async function NotOpenHere({ location }: { location: ViewerLocation }) {
  const metro = location.place.metro;
  const [viewer, waiting, listingCount] = await Promise.all([
    getViewer(),
    metro ? waitlistCount(metro.id) : Promise.resolve(0),
    metro ? liveListingCount(metro.id) : Promise.resolve(0),
  ]);
  return (
    <NotOpenScreen
      metro={metro}
      zip={location.zip}
      waitingCount={waiting}
      listingCount={listingCount}
      signedIn={Boolean(viewer)}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
    />
  );
}
