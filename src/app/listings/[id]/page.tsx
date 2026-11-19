import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelListing } from "@/app/sell/actions";
import { Avatar } from "@/components/Avatar";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { AuctionPanel } from "@/components/item/AuctionPanel";
import { PhotoGallery } from "@/components/item/PhotoGallery";
import { WatchButton } from "@/components/item/WatchButton";
import { ListingBadges } from "@/components/listings/Badges";
import { SellerNoteForm } from "@/components/listings/SellerNoteForm";
import { CardSkeleton } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { countdown, daysHoursLeft, endsAtLabel } from "@/lib/countdown";
import { formatMiles } from "@/lib/distance";
import {
  categoryLabel,
  conditionLabel,
  PICKUP_BLOCKS,
  pickupDayLabel,
  SIZE_HINTS,
} from "@/lib/listing-options";
import { editPermissions } from "@/lib/listing-rules";
import { formatCents } from "@/lib/money";
import { withNext } from "@/lib/next-path";
import { localDate, weekdayName } from "@/lib/time";
import { auctionForListing, bidStanding, hasEverBid } from "@/server/auctions/service";
import { isWatching } from "@/server/auctions/watch";
import { getViewer } from "@/server/auth/session";
import { findZip, milesBetweenZips } from "@/server/geo/places";
import { getViewerLocation } from "@/server/geo/viewer-location";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { metroSchedule } from "@/server/listings/metro-schedule";
import {
  bidCountFor,
  findOwnListing,
  findPublicListing,
  listPhotos,
  sellerSummary,
} from "@/server/listings/repo";
import { defaultCard } from "@/server/payments/cards";

export const metadata: Metadata = { title: "Listing" };

/**
 * The item page (mockup Item.dc.html). Everyone sees live listings in open metros; the seller also
 * sees their own drafts and listings in review or waiting for their city, with edit controls.
 */
export default function ItemPage({ params, searchParams }: PageProps<"/listings/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3.5 px-4 pt-0 pb-32 sm:pt-6">
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Item params={params} searchParams={searchParams} />
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

async function Item({ params, searchParams }: PageProps<"/listings/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewer();
  const own = viewer ? await findOwnListing(id, viewer.id) : undefined;
  const pub = own ? undefined : await findPublicListing(id);
  const listing = own ?? pub?.listing;
  if (!listing) notFound();

  const [photos, place, location, bids, auction, seller] = await Promise.all([
    listPhotos(id),
    listing.pickupZip ? findZip(listing.pickupZip) : Promise.resolve(null),
    getViewerLocation(),
    bidCountFor(id),
    auctionForListing(id),
    sellerSummary(listing.sellerId),
  ]);
  const schedule = listing.metroId ? await metroSchedule(listing.metroId) : undefined;
  const miles =
    location && listing.pickupZip ? await milesBetweenZips(location.zip, listing.pickupZip) : null;
  const permissions = editPermissions({ status: listing.status, bidCount: bids });
  const shown = photos.filter((p) => p.kind === "photo");
  const proof = photos.filter((p) => p.kind !== "photo");
  const blockLabel = (slug: string) =>
    PICKUP_BLOCKS.find((b) => b.slug === slug)?.label.toLowerCase();
  const title = listing.title ?? "Untitled draft";
  const timeZone = schedule?.timeZone ?? "America/Chicago";
  const now = new Date();

  // The badge follows the auction's actual end (in the metro's zone), not just the listing's date.
  const closingDay = auction ? localDate(auction.endsAt, timeZone) : listing.closingNightDate;
  const [watching, standing, card, firstBid] = viewer
    ? await Promise.all([
        isWatching(viewer.id, id),
        auction ? bidStanding(auction.id, viewer.id) : Promise.resolve(null),
        defaultCard(viewer.id),
        hasEverBid(viewer.id).then((any) => !any),
      ])
    : [false, null, null, true];

  const back = `/listings/${id}`;
  const bidViewer = !viewer
    ? ({ kind: "signed-out", href: withNext("/sign-in", back) } as const)
    : !viewer.phoneVerified
      ? ({ kind: "needs-phone", href: withNext("/verify-phone", back) } as const)
      : ({ kind: "member", card, firstBid } as const);

  const location2 = [
    miles !== null ? formatMiles(miles) : null,
    place?.area?.name ?? place?.metro?.shortName,
    listing.condition ? conditionLabel(listing.condition) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="flex flex-col gap-3.5">
      {shown.length > 0 ? (
        <PhotoGallery
          title={title}
          backHref="/"
          photos={shown.map((p) => ({
            id: p.id,
            url: listingPhotoUrl(p.storageKey, "full"),
            width: p.width,
            height: p.height,
          }))}
          topRight={own ? undefined : <WatchButton listingId={id} watching={watching} />}
        />
      ) : null}

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

      <div className="flex flex-wrap gap-2">
        {closingDay ? (
          <span className="rounded-md bg-brand-mustard px-2 py-0.75 text-[11px] font-bold tracking-wide text-brand-navy">
            {closingDay === localDate(now, timeZone)
              ? "CLOSING TONIGHT"
              : `CLOSING ${weekdayName(closingDay).toUpperCase()}`}
          </span>
        ) : null}
        {listing.category ? (
          <span className="rounded-md border-[1.5px] border-brand-navy px-2 py-0.5 text-[11px] font-bold tracking-wide text-brand-navy">
            {categoryLabel(listing.category).toUpperCase()}
          </span>
        ) : null}
      </div>

      <div>
        <ListingBadges
          isFree={listing.isFree}
          isLot={listing.isLot}
          lotItemCount={listing.lotItemCount}
        />
        <h1 className="mt-1 font-display text-[25px] leading-tight font-extrabold text-brand-navy">
          {title}
        </h1>
        {location2 ? <div className="mt-1 text-sm text-brand-ink-muted">{location2}</div> : null}
      </div>

      {auction ? (
        <AuctionPanel
          listingId={id}
          title={title}
          coverUrl={
            shown[0] ? listingPhotoUrl(shown[0].storageKey, "thumb", { square: true }) : null
          }
          initial={{
            auctionId: auction.id,
            currentPriceCents: auction.currentPriceCents,
            bidCount: auction.bidCount,
            endsAt: auction.endsAt.toISOString(),
            extended: false,
          }}
          scheduledEndsAt={auction.scheduledEndsAt.toISOString()}
          endsAtLabel={endsAtLabel(auction.endsAt, timeZone)}
          initialCountdown={(() => {
            const c = countdown({
              now,
              endsAt: auction.endsAt,
              timeZone,
              bidCount: auction.bidCount,
              currentPriceCents: auction.currentPriceCents,
              relists: listing.unsoldAction !== "end",
            });
            return c.text.startsWith("Ends ") ? daysHoursLeft(now, auction.endsAt) : c.text;
          })()}
          timeZone={timeZone}
          isFree={auction.isFree}
          startPriceCents={auction.startPriceCents}
          relists={listing.unsoldAction !== "end"}
          open={auction.status === "open"}
          isOwner={Boolean(own)}
          viewer={bidViewer}
          initialStanding={standing}
          turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
        />
      ) : (
        <div className="rounded-xl bg-white px-4 py-3.5">
          <div className="text-[13px] text-brand-ink-muted">Starting bid</div>
          <div className="font-display text-[34px] leading-[1.05] font-extrabold text-brand-navy">
            {listing.isFree ? "Free" : formatCents(listing.startPriceCents)}
          </div>
          {schedule && schedule.status !== "open" ? (
            <div className="text-[13px] text-brand-ink-muted">
              Waiting for {schedule.shortName} to open
            </div>
          ) : null}
        </div>
      )}

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

      {listing.whyItsHere ? (
        <section aria-labelledby="why" className="rounded-xl bg-white px-4 py-3.5">
          <h2 id="why" className="mb-1.5 font-display text-[15px] font-extrabold text-brand-navy">
            Why it&apos;s here
          </h2>
          <p className="text-[15px] leading-relaxed text-brand-navy">{listing.whyItsHere}</p>
        </section>
      ) : null}

      {listing.description ? (
        <p className="text-[15px] text-brand-navy">{listing.description}</p>
      ) : null}
      {listing.isLot && listing.lotContents ? (
        <section aria-labelledby="included">
          <h2 id="included" className="font-display text-[15px] font-extrabold text-brand-navy">
            What&apos;s included
          </h2>
          <p className="mt-1 whitespace-pre-line text-brand-navy">{listing.lotContents}</p>
        </section>
      ) : null}
      {listing.sellerNotes.length > 0 ? (
        <section aria-labelledby="notes">
          <h2 id="notes" className="font-display text-[15px] font-extrabold text-brand-navy">
            Notes from the seller
          </h2>
          <ul className="mt-1 flex flex-col gap-1 text-brand-navy">
            {listing.sellerNotes.map((n) => (
              <li key={n.addedAt}>{n.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex items-center gap-3">
        <Avatar displayName={seller.displayName} size="md" className="size-11 text-base" />
        <div className="flex-1">
          <div className="text-[15px] font-bold text-brand-navy">
            {seller.displayName ?? "A neighbor"}
          </div>
          <div className="text-[13px] text-brand-ink-muted">
            New seller
            {listing.pickupWindows.length > 0 && schedule
              ? ` · pickup ${listing.pickupWindows
                  .map(
                    (w) =>
                      `${pickupDayLabel(schedule.closingWeekday, w.dayOffset)} ${blockLabel(w.block)}`,
                  )
                  .join(", ")}`
              : " · pickup after Closing Night"}
          </div>
        </div>
        {seller.phoneVerified ? (
          <ShieldCheck aria-label="Phone verified" className="size-5.5 text-brand-avocado" />
        ) : null}
      </div>

      {listing.sizeHint ? (
        <p className="text-[13px] text-brand-ink-muted">
          Size: {SIZE_HINTS.find((s) => s.slug === listing.sizeHint)?.label}
        </p>
      ) : null}
      <p className="text-[13px] text-brand-ink-muted">
        Payment protection: you&apos;re charged only if you win, and the seller is paid after you
        pick it up. Exact address shared after payment.
      </p>
    </article>
  );
}
