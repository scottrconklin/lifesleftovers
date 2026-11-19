import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CardSkeleton } from "@/components/PageCard";
import { ReviewForm, type ReviewValues } from "@/components/sell/ReviewForm";
import { SellHeader } from "@/components/sell/SellHeader";
import { marketplaceConfig } from "@/config/marketplace";
import { editPermissions } from "@/lib/listing-rules";
import { requireStep } from "@/server/auth/session";
import { findZip } from "@/server/geo/places";
import { closingNightOptions, metroSchedule } from "@/server/listings/metro-schedule";
import { bidCountFor, findOwnListing, listPhotos } from "@/server/listings/repo";
import { photoView } from "@/server/listings/views";

export const metadata: Metadata = { title: "Review your listing" };

export default function ReviewPage({ params }: PageProps<"/sell/[id]/review">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 pt-3">
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Review params={params} />
      </Suspense>
    </main>
  );
}

async function Review({ params }: Pick<PageProps<"/sell/[id]/review">, "params">) {
  const { id } = await params;
  const viewer = await requireStep("list", `/sell/${id}/review`);
  const listing = await findOwnListing(id, viewer.id);
  if (!listing) notFound();
  const permissions = editPermissions({ status: listing.status, bidCount: await bidCountFor(id) });
  if (!permissions.editEverything) redirect(`/listings/${id}`);

  const allPhotos = await listPhotos(id);
  if (!allPhotos.some((p) => p.kind === "photo")) redirect(`/sell/${id}`);

  const place = listing.pickupZip ? await findZip(listing.pickupZip) : null;
  const schedule = place?.metro ? await metroSchedule(place.metro.id) : undefined;
  const closingNights = schedule ? closingNightOptions(schedule) : null;
  const custom =
    !listing.isFree && listing.startPriceCents > marketplaceConfig.pricing.defaultStartPriceCents;

  const values: ReviewValues = {
    title: listing.title ?? "",
    category: listing.category ?? "",
    condition: listing.condition ?? "",
    description: listing.description ?? "",
    whyItsHere: listing.whyItsHere ?? "",
    isLot: listing.isLot,
    isFree: listing.isFree,
    lotItemCount: listing.lotItemCount,
    lotContents: listing.lotContents ?? "",
    sizeHint: listing.sizeHint,
    startChoice: custom ? "custom" : "default",
    customStart: custom ? String(listing.startPriceCents / 100) : "",
    isBrandName: listing.isBrandName,
    authenticityConfirmed: Boolean(listing.authenticityConfirmedAt),
    pickupZip: listing.pickupZip ?? "",
    pickupWindows:
      listing.pickupWindows.length > 0
        ? listing.pickupWindows
        : [
            { dayOffset: 1, block: "evening" },
            { dayOffset: 6, block: "morning" },
          ],
    closingNightDate: listing.closingNightDate,
    unsoldAction: listing.unsoldAction,
  };

  const mode = listing.status === "draft" ? "post" : "edit";
  return (
    <>
      <SellHeader
        title={mode === "post" ? "Review your listing" : "Edit your listing"}
        step={mode === "post" ? "Step 2 of 2" : ""}
        closeHref={mode === "post" ? "/account/listings" : `/listings/${id}`}
      />
      <ReviewForm
        listingId={id}
        mode={mode}
        values={values}
        aiFilled={Boolean(listing.aiSuggestion)}
        suggestedStartCents={listing.suggestedStartCents}
        photos={allPhotos.filter((p) => p.kind === "photo").map(photoView)}
        proofPhotos={allPhotos.filter((p) => p.kind !== "photo").map(photoView)}
        closingNights={closingNights}
        waitingMetroName={
          place?.metro && place.metro.status !== "open" ? place.metro.shortName : null
        }
        pickupAreaLabel={
          place ? `${place.area?.name ?? place.metro?.shortName ?? ""} ${place.zip}`.trim() : null
        }
        closingWeekday={schedule?.closingWeekday ?? marketplaceConfig.closingNight.defaultWeekday}
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
        canRemovePhotos={permissions.editEverything}
      />
    </>
  );
}
