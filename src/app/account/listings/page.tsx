import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { formatShortDate } from "@/lib/time";
import { requireViewer } from "@/server/auth/session";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { sellerListings, type SellerListing } from "@/server/listings/repo";

export const metadata: Metadata = { title: "Your listings" };

export default function MyListingsPage() {
  return (
    <PageCard title="Your listings">
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <MyListings />
      </Suspense>
    </PageCard>
  );
}

function statusLine(l: SellerListing): string {
  switch (l.status) {
    case "draft":
      return "Draft";
    case "in_review":
      return "In review";
    case "cancelled":
      return "Cancelled";
    case "removed":
      return "Removed";
    case "live":
      if (l.metroStatus !== "open") return `Waiting for ${l.metroShortName ?? "your city"} to open`;
      return l.closingNightDate ? `Live · Ends ${formatShortDate(l.closingNightDate)}` : "Live";
  }
}

async function MyListings() {
  const viewer = await requireViewer("/account/listings");
  const listings = await sellerListings(viewer.id);
  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-brand-navy">
          Nothing listed yet. That garage isn&apos;t going to empty itself.
        </p>
        <Link href="/sell" className={buttonVariants()}>
          Sell an item
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-brand-line">
      {listings.map((l) => (
        <li key={l.id}>
          <Link
            href={l.status === "draft" ? `/sell/${l.id}` : `/listings/${l.id}`}
            className="flex items-center gap-3 py-3"
          >
            {l.coverKey ? (
              // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
              <img
                src={listingPhotoUrl(l.coverKey, "thumb", { square: true })}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="size-14 shrink-0 rounded-lg bg-brand-sand" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-brand-navy">
                {l.title ?? "Untitled draft"}
              </span>
              <span className="block text-sm text-brand-ink-muted">
                {l.isFree ? "Free" : formatCents(l.startPriceCents)} · {statusLine(l)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
