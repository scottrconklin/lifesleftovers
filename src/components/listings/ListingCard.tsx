import Link from "next/link";
import { distanceLabel } from "@/lib/distance";
import { formatCents } from "@/lib/money";
import { countdown } from "@/lib/countdown";
import { formatShortDate } from "@/lib/time";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import type { NearbyListing } from "@/server/listings/repo";
import { ListingBadges } from "./Badges";

/**
 * A wall card: square, center-cropped photo; "$7 · 5 bids"; "8 mi · Katy"; up to two badges.
 * The full card design (countdowns, Closing tonight badge) lands with the wall in Milestone 8.
 */
export function ListingCard({ listing, now }: { listing: NearbyListing; now: Date }) {
  const ends = listing.endsAt
    ? countdown({
        now,
        endsAt: listing.endsAt,
        timeZone: listing.timeZone,
        bidCount: listing.bidCount,
        currentPriceCents: listing.currentPriceCents,
        relists: true,
      }).text
    : listing.closingNightDate
      ? `Ends ${formatShortDate(listing.closingNightDate)}`
      : null;
  return (
    <li>
      <Link
        href={`/listings/${listing.id}`}
        className="flex h-full flex-col overflow-hidden rounded-xl bg-white text-left text-brand-navy"
      >
        {listing.coverKey ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
          <img
            src={listingPhotoUrl(listing.coverKey, "card", { square: true })}
            alt=""
            loading="lazy"
            className="aspect-square w-full bg-brand-sand object-cover"
          />
        ) : (
          <span className="aspect-square w-full bg-brand-sand" aria-hidden="true" />
        )}
        <span className="flex flex-1 flex-col gap-1 p-2.5">
          <ListingBadges
            isFree={listing.isFree}
            isLot={listing.isLot}
            secondChance={listing.secondChance}
            lotItemCount={listing.lotItemCount}
          />
          <span className="line-clamp-2 text-sm font-semibold">{listing.title}</span>
          <span className="text-sm">
            <strong>
              {listing.isFree && listing.bidCount === 0
                ? "Free"
                : formatCents(listing.currentPriceCents)}
            </strong>{" "}
            · {listing.bidCount} {listing.bidCount === 1 ? "bid" : "bids"}
          </span>
          <span className="text-xs text-brand-ink-muted">
            {distanceLabel(listing.miles, listing.areaName)}
            {ends ? ` · ${ends}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}
