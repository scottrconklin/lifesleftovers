import { Suspense } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { BrowsingNear } from "@/components/location/BrowsingNear";
import { LocationPicker } from "@/components/location/LocationPicker";
import { NotOpenScreen } from "@/components/not-open/NotOpenScreen";
import { CardSkeleton } from "@/components/PageCard";
import { getViewer } from "@/server/auth/session";
import { waitlistCount } from "@/server/geo/places";
import { getViewerLocation, type ViewerLocation } from "@/server/geo/viewer-location";

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

  // Live auctions arrive with listings (Milestone 3); until then there's nothing to measure, so
  // the notice shows the empty state.
  const auctionDistancesMiles: number[] = [];
  return (
    <HomeShell>
      <BrowsingNear location={location} auctionDistancesMiles={auctionDistancesMiles} />
    </HomeShell>
  );
}

async function NotOpenHere({ location }: { location: ViewerLocation }) {
  const metro = location.place.metro;
  const [viewer, waiting] = await Promise.all([
    getViewer(),
    metro ? waitlistCount(metro.id) : Promise.resolve(0),
  ]);
  return (
    <NotOpenScreen
      metro={metro}
      zip={location.zip}
      waitingCount={waiting}
      listingCount={0 /* saved listings arrive with Milestone 3 */}
      signedIn={Boolean(viewer)}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
    />
  );
}
