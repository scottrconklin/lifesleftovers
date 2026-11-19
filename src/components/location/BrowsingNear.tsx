import { MapPin } from "lucide-react";
import { changeLocation } from "@/app/location/actions";
import { Button } from "@/components/ui/button";
import { chooseRadius, radiusNotice } from "@/lib/radius";
import type { ViewerLocation } from "@/server/geo/viewer-location";
import { RadiusNotice } from "./RadiusNotice";
import { RadiusSlider } from "./RadiusSlider";

/**
 * Location bar for an open metro: where you're browsing, the distance slider, and the auto-widen
 * notice. `auctionDistancesMiles` are the live auctions' distances from the viewer's zip.
 */
export function BrowsingNear({
  location,
  auctionDistancesMiles,
}: {
  location: ViewerLocation;
  auctionDistancesMiles: readonly number[];
}) {
  const { place } = location;
  const notice = radiusNotice(chooseRadius(auctionDistancesMiles, location.radiusMiles));
  return (
    <section
      aria-labelledby="browsing-heading"
      className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-brand-line bg-white p-6 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand-tomato-strong" />
          <div>
            <h2 id="browsing-heading" className="font-display text-lg font-bold text-brand-navy">
              Browsing near {place.area?.name ?? place.zip}
            </h2>
            <p className="text-sm text-brand-ink-muted">
              {place.metro?.name} · {place.zip}
            </p>
          </div>
        </div>
        <form action={changeLocation}>
          <Button type="submit" variant="link" className="px-0">
            Change
          </Button>
        </form>
      </div>
      <RadiusSlider key={location.radiusMiles} radiusMiles={location.radiusMiles} />
      {notice ? <RadiusNotice notice={notice} /> : null}
    </section>
  );
}
