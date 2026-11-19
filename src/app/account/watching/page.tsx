import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { formatShortDate } from "@/lib/time";
import { auctionForListing } from "@/server/auctions/service";
import { watchedListingIds } from "@/server/auctions/watch";
import { requireViewer } from "@/server/auth/session";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { findPublicListing, listPhotos } from "@/server/listings/repo";

export const metadata: Metadata = { title: "Watching" };

export default function WatchingPage() {
  return (
    <PageCard title="Watching">
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <Watching />
      </Suspense>
    </PageCard>
  );
}

async function Watching() {
  const viewer = await requireViewer("/account/watching");
  const ids = await watchedListingIds(viewer.id);
  const items = (
    await Promise.all(
      ids.map(async (id) => {
        const found = await findPublicListing(id);
        if (!found) return null; // ended, cancelled or removed since
        const [auction, photos] = await Promise.all([auctionForListing(id), listPhotos(id)]);
        return { listing: found.listing, auction, cover: photos.find((p) => p.kind === "photo") };
      }),
    )
  ).filter((x) => x !== null);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-brand-navy">
          Nothing on your list yet. Tap the heart on anything you&apos;re eyeing.
        </p>
        <Link href="/" className={buttonVariants()}>
          Browse auctions
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-brand-line">
      {items.map(({ listing, auction, cover }) => (
        <li key={listing.id}>
          <Link href={`/listings/${listing.id}`} className="flex items-center gap-3 py-3">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
              <img
                src={listingPhotoUrl(cover.storageKey, "thumb", { square: true })}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="size-14 shrink-0 rounded-lg bg-brand-sand" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-brand-navy">{listing.title}</span>
              <span className="block text-sm text-brand-ink-muted">
                {formatCents(auction?.currentPriceCents ?? listing.startPriceCents)} ·{" "}
                {auction?.bidCount ?? 0} bids
                {listing.closingNightDate
                  ? ` · Ends ${formatShortDate(listing.closingNightDate)}`
                  : ""}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
