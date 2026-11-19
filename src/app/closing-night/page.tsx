import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  ClosingNightLive,
  type LiveItemView,
  type LiveViewData,
} from "@/components/closing-night/ClosingNightLive";
import { CardSkeleton } from "@/components/PageCard";
import { buttonVariants } from "@/components/ui/button";
import { clockTime, endsAtLabel } from "@/lib/countdown";
import { withNext } from "@/lib/next-path";
import { bidStanding, hasEverBid } from "@/server/auctions/service";
import { closingNightView, type LiveItem } from "@/server/auctions/closing-night-view";
import { getViewer } from "@/server/auth/session";
import { getViewerLocation } from "@/server/geo/viewer-location";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { defaultCard } from "@/server/payments/cards";

export const metadata: Metadata = { title: "Closing Night" };

/**
 * The Closing Night live view (mockup ClosingNight.dc.html): one item closing per minute, the
 * current one large with a ticking clock and live bids, the next few below, and what just sold.
 */
export default function ClosingNightPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      <Suspense
        fallback={
          <div className="p-4">
            <CardSkeleton lines={6} />
          </div>
        }
      >
        <Live />
      </Suspense>
    </main>
  );
}

function itemView(item: LiveItem, timeZone: string): LiveItemView {
  return {
    auctionId: item.auctionId,
    listingId: item.listingId,
    title: item.title,
    isFree: item.isFree,
    lotLabel: item.isLot ? (item.lotItemCount ? `LOT · ${item.lotItemCount} ITEMS` : "LOT") : null,
    startPriceCents: item.startPriceCents,
    currentPriceCents: item.currentPriceCents,
    bidCount: item.bidCount,
    endsAt: item.endsAt.toISOString(),
    scheduledEndsAt: item.scheduledEndsAt.toISOString(),
    time: clockTime(item.endsAt, timeZone),
    coverUrl: item.coverKey ? listingPhotoUrl(item.coverKey, "card") : null,
    thumbUrl: item.coverKey ? listingPhotoUrl(item.coverKey, "thumb", { square: true }) : null,
    areaName: item.areaName,
  };
}

async function Live() {
  const location = await getViewerLocation();
  const metro = location?.place.metro;
  if (!metro || metro.status !== "open") redirect("/");

  const now = new Date();
  const [view, viewer] = await Promise.all([closingNightView(metro.id, now), getViewer()]);
  if (!view) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <h1 className="font-display text-2xl font-extrabold text-brand-navy">Closing Night</h1>
        <p className="text-brand-navy">
          Nothing is lined up for {metro.shortName}&apos;s next Closing Night yet. Got something in
          the garage?
        </p>
        <Link href="/sell" className={buttonVariants()}>
          Sell an item
        </Link>
      </div>
    );
  }

  const back = "/closing-night";
  const [card, firstBid, standing] = viewer
    ? await Promise.all([
        defaultCard(viewer.id),
        hasEverBid(viewer.id).then((any) => !any),
        view.current ? bidStanding(view.current.auctionId, viewer.id) : null,
      ])
    : [null, true, null];

  const data: LiveViewData = {
    metroId: view.metroId,
    metroName: metro.shortName,
    timeZone: view.timeZone,
    startsAt: view.startsAt.toISOString(),
    startsAtLabel: endsAtLabel(view.startsAt, view.timeZone),
    startedAtRender: now >= view.startsAt,
    total: view.total,
    closedCount: view.closedCount,
    current: view.current ? itemView(view.current, view.timeZone) : null,
    upNext: view.upNext.map((i) => itemView(i, view.timeZone)),
    justSold: view.justSold,
  };

  return (
    <ClosingNightLive
      key={view.current?.auctionId ?? "done"}
      data={data}
      viewer={
        !viewer
          ? { kind: "signed-out", href: withNext("/sign-in", back) }
          : !viewer.phoneVerified
            ? { kind: "needs-phone", href: withNext("/verify-phone", back) }
            : { kind: "member", card, firstBid }
      }
      initialStanding={standing}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null}
    />
  );
}
