import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelListing } from "@/app/sell/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ListingBadges } from "@/components/listings/Badges";
import { SellerNoteForm } from "@/components/listings/SellerNoteForm";
import { CardSkeleton } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { distanceLabel } from "@/lib/distance";
import {
  categoryLabel,
  conditionLabel,
  PICKUP_BLOCKS,
  pickupDayLabel,
  SIZE_HINTS,
} from "@/lib/listing-options";
import { editPermissions } from "@/lib/listing-rules";
import { formatCents } from "@/lib/money";
import { formatShortDate } from "@/lib/time";
import { getViewer } from "@/server/auth/session";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { findZip, milesBetweenZips } from "@/server/geo/places";
import { getViewerLocation } from "@/server/geo/viewer-location";
import { metroSchedule } from "@/server/listings/metro-schedule";
import { bidCountFor, findOwnListing, findPublicListing, listPhotos } from "@/server/listings/repo";

export const metadata: Metadata = { title: "Listing" };

/**
 * A listing. Everyone sees live listings in open metros; the seller also sees their own drafts,
 * listings in review or waiting for their city, and the edit/cancel controls. The full item page
 * with bidding (Item.dc.html) arrives with Milestone 4.
 */
export default function ListingPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Listing params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const STATUS_TEXT: Record<string, string> = {
  draft: "Draft: not posted yet",
  in_review: "In review: a person will check it before it goes live",
  live: "Live",
  cancelled: "Cancelled",
  removed: "Removed by Life's Leftovers",
};

async function Listing({ params, searchParams }: PageProps<"/listings/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const own = viewer ? await findOwnListing(id, viewer.id) : undefined;
  const pub = own ? undefined : await findPublicListing(id);
  const listing = own ?? pub?.listing;
  if (!listing) notFound();

  const [photos, place, location, bids] = await Promise.all([
    listPhotos(id),
    listing.pickupZip ? findZip(listing.pickupZip) : Promise.resolve(null),
    getViewerLocation(),
    bidCountFor(id),
  ]);
  const schedule = listing.metroId ? await metroSchedule(listing.metroId) : undefined;
  const miles =
    location && listing.pickupZip ? await milesBetweenZips(location.zip, listing.pickupZip) : null;
  const permissions = editPermissions({ status: listing.status, bidCount: bids });
  const shown = photos.filter((p) => p.kind === "photo");
  const proof = photos.filter((p) => p.kind !== "photo");
  const blockLabel = (slug: string) =>
    PICKUP_BLOCKS.find((b) => b.slug === slug)?.label.toLowerCase();

  return (
    <article className="flex flex-col gap-4">
      {query.posted ? (
        <FormMessage tone="success" className="rounded-xl bg-white px-4 py-3 text-base">
          {listing.status === "live"
            ? schedule?.status === "open"
              ? "Posted! It's live now."
              : `Saved! It goes live on ${schedule?.shortName ?? "your city"}'s first Closing Night.`
            : "Thanks! A person will check this listing before it goes live."}
        </FormMessage>
      ) : null}
      {query.saved ? (
        <FormMessage tone="success" className="rounded-xl bg-white px-4 py-3 text-base">
          Changes saved.
        </FormMessage>
      ) : null}

      {shown.length > 0 ? (
        <ul
          aria-label="Photos"
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"
        >
          {shown.map((p, i) => (
            <li key={p.id} className="w-[85%] max-w-md shrink-0 snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs */}
              <img
                src={listingPhotoUrl(p.storageKey, "full")}
                alt={`${listing.title ?? "Listing"}, photo ${i + 1} of ${shown.length}`}
                width={p.width}
                height={p.height}
                className="aspect-square w-full rounded-2xl bg-brand-sand object-contain"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <ListingBadges
          isFree={listing.isFree}
          isLot={listing.isLot}
          lotItemCount={listing.lotItemCount}
        />
        <h1 className="font-display text-2xl font-extrabold text-brand-navy">
          {listing.title ?? "Untitled draft"}
        </h1>
        <p className="text-lg font-bold text-brand-navy">
          {listing.isFree ? "Free" : `Starts at ${formatCents(listing.startPriceCents)}`}
          <span className="font-normal text-brand-ink-muted"> · {bids} bids</span>
        </p>
        <p className="text-brand-navy">
          {miles !== null
            ? distanceLabel(miles, place?.area?.name ?? null)
            : (place?.area?.name ?? place?.metro?.shortName ?? "")}
          {listing.closingNightDate
            ? ` · Ends ${formatShortDate(listing.closingNightDate)}`
            : schedule && schedule.status !== "open"
              ? ` · Waiting for ${schedule.shortName} to open`
              : ""}
        </p>
      </div>

      {own ? (
        <section aria-labelledby="yours" className="flex flex-col gap-3 rounded-xl bg-white p-4">
          <h2 id="yours" className="text-sm font-bold text-brand-navy">
            Your listing · {STATUS_TEXT[listing.status]}
          </h2>
          <div className="flex flex-wrap gap-2">
            {permissions.editEverything ? (
              <Link
                href={listing.status === "draft" ? `/sell/${id}` : `/sell/${id}/review`}
                className={buttonVariants({ variant: "outline", className: "bg-white" })}
              >
                {listing.status === "draft" ? "Finish your listing" : "Edit listing"}
              </Link>
            ) : null}
            {permissions.cancel ? (
              <form action={cancelListing}>
                <input type="hidden" name="listingId" value={id} />
                <SubmitButton pendingLabel="Cancelling…" variant="outline" className="bg-white">
                  Cancel listing
                </SubmitButton>
              </form>
            ) : null}
          </div>
          {permissions.addNotes ? <SellerNoteForm listingId={id} /> : null}
          {proof.length > 0 ? (
            <p className="text-sm text-brand-ink-muted">
              {proof.length} authenticity photo{proof.length > 1 ? "s" : ""} on file.
            </p>
          ) : null}
        </section>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-brand-navy">
        {listing.condition ? (
          <>
            <dt className="font-semibold">Condition</dt>
            <dd>{conditionLabel(listing.condition)}</dd>
          </>
        ) : null}
        {listing.category ? (
          <>
            <dt className="font-semibold">Category</dt>
            <dd>{categoryLabel(listing.category)}</dd>
          </>
        ) : null}
        {listing.sizeHint ? (
          <>
            <dt className="font-semibold">Size</dt>
            <dd>{SIZE_HINTS.find((s) => s.slug === listing.sizeHint)?.label}</dd>
          </>
        ) : null}
        {listing.pickupWindows.length > 0 && schedule ? (
          <>
            <dt className="font-semibold">Pickup</dt>
            <dd>
              {listing.pickupWindows
                .map(
                  (w) =>
                    `${pickupDayLabel(schedule.closingWeekday, w.dayOffset)} ${blockLabel(w.block)}`,
                )
                .join(", ")}
            </dd>
          </>
        ) : null}
        {pub?.sellerName ? (
          <>
            <dt className="font-semibold">Seller</dt>
            <dd>{pub.sellerName}</dd>
          </>
        ) : null}
      </dl>

      {listing.whyItsHere ? (
        <section aria-labelledby="why" className="rounded-xl bg-white p-4">
          <h2 id="why" className="font-display text-base font-bold text-brand-navy">
            Why it&apos;s here
          </h2>
          <p className="mt-1 text-brand-navy">{listing.whyItsHere}</p>
        </section>
      ) : null}
      {listing.description ? <p className="text-brand-navy">{listing.description}</p> : null}
      {listing.isLot && listing.lotContents ? (
        <section aria-labelledby="included">
          <h2 id="included" className="font-display text-base font-bold text-brand-navy">
            What&apos;s included
          </h2>
          <p className="mt-1 whitespace-pre-line text-brand-navy">{listing.lotContents}</p>
        </section>
      ) : null}
      {listing.sellerNotes.length > 0 ? (
        <section aria-labelledby="notes">
          <h2 id="notes" className="font-display text-base font-bold text-brand-navy">
            Notes from the seller
          </h2>
          <ul className="mt-1 flex flex-col gap-1 text-brand-navy">
            {listing.sellerNotes.map((n) => (
              <li key={n.addedAt}>{n.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
