"use client";

import { CircleAlert, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { myStanding } from "@/app/bid/actions";
import { minimumBidCents } from "@/lib/bidding";
import { useLiveAuction } from "@/lib/client/use-live-auction";
import { useServerNow } from "@/lib/client/use-server-clock";
import { formatCents } from "@/lib/money";
import type { AuctionUpdate } from "@/lib/realtime";
import { BidSheet, type BidSheetViewer } from "./BidSheet";
import { Countdown } from "./Countdown";

/** How long after the end to reload if the "closed" broadcast hasn't arrived. */
const CLOSE_RECHECK_MS = 20_000;

export type Standing = { hasBid: boolean; leading: boolean; myMaxCents: number | null };

/**
 * The live auction block of the item page (mockup Item.dc.html): current bid, bid count, the
 * countdown, your standing, and the fixed "Next bid / Place Bid" bar. Price, count and end time
 * update live over Supabase Realtime; your own standing is re-checked with the server.
 */
export function AuctionPanel({
  listingId,
  title,
  coverUrl,
  initial,
  scheduledEndsAt,
  endsAtLabel,
  initialCountdown,
  timeZone,
  isFree,
  startPriceCents,
  relists,
  open,
  isOwner,
  viewer,
  initialStanding,
  turnstileSiteKey,
}: {
  listingId: string;
  title: string;
  coverUrl: string | null;
  initial: AuctionUpdate;
  scheduledEndsAt: string;
  endsAtLabel: string;
  initialCountdown: string;
  timeZone: string;
  isFree: boolean;
  startPriceCents: number;
  relists: boolean;
  open: boolean;
  isOwner: boolean;
  viewer: BidSheetViewer;
  initialStanding: Standing | null;
  turnstileSiteKey: string | null;
}) {
  const [standing, setStanding] = useState(initialStanding);
  const [, refreshStanding] = useTransition();
  // Re-check your own standing on every update (it may have flipped to "Outbid!"). Signed-in
  // members only; the callback is captured once, so it must not depend on render-time state.
  const router = useRouter();
  const live = useLiveAuction(
    initial,
    () => {
      if (viewer.kind === "member") {
        refreshStanding(async () => setStanding(await myStanding(initial.auctionId)));
      }
    },
    // Closed: reload to show how it ended (sold, or relisted as a Second Chance).
    () => router.refresh(),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [localLive, setLocalLive] = useState<AuctionUpdate | null>(null);
  const state = localLive && localLive.bidCount > live.bidCount ? localLive : live;

  // Only public facts are on the client: the minimum depends on price and count, not on maxes.
  const minimum = minimumBidCents({
    isFree,
    startPriceCents,
    currentPriceCents: state.currentPriceCents,
    highBidderId: null,
    highMaxCents: null,
    bidCount: state.bidCount,
  });
  const now = useServerNow();
  const ended = now !== null && now.getTime() >= new Date(state.endsAt).getTime();
  const noBids = state.bidCount === 0;

  // Missed the broadcast (asleep tab, flaky network)? Check again a little after the end.
  useEffect(() => {
    if (!ended || !open) return;
    const timer = setTimeout(() => router.refresh(), CLOSE_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [ended, open, router]);

  return (
    <>
      <div className="flex items-end justify-between rounded-xl bg-white px-4 py-3.5">
        <div>
          <div className="text-[13px] text-brand-ink-muted">
            {noBids ? "Starting bid" : "Current bid"}
          </div>
          <div
            className="font-display text-[34px] leading-[1.05] font-extrabold"
            data-testid="current-bid"
          >
            {isFree && noBids ? "Free" : formatCents(state.currentPriceCents)}
          </div>
          <div className="text-[13px] text-brand-ink-muted" data-testid="bid-count">
            {noBids
              ? "No bids yet. Be the first."
              : `${state.bidCount} ${state.bidCount === 1 ? "bid" : "bids"} · started at ${formatCents(startPriceCents)}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-brand-ink-muted">Ends {endsAtLabel}</div>
          <Countdown
            big
            endsAt={state.endsAt}
            scheduledEndsAt={scheduledEndsAt}
            timeZone={timeZone}
            bidCount={state.bidCount}
            currentPriceCents={state.currentPriceCents}
            relists={relists}
            initialText={initialCountdown}
            className="font-display text-xl font-extrabold"
          />
        </div>
      </div>

      {standing?.hasBid ? (
        standing.leading ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-brand-avocado"
          >
            <Trophy aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              You&apos;re the high bidder.
              {standing.myMaxCents ? ` Your max: ${formatCents(standing.myMaxCents)}.` : ""}
            </span>
          </p>
        ) : (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-brand-tomato-deep"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>Outbid! Someone wants it more. Bid again?</span>
          </p>
        )
      ) : null}

      {!isOwner && open && !ended ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E3D8C6] bg-white">
          <div className="mx-auto flex max-w-xl items-center gap-4 px-5 pt-3 pb-6">
            <div className="flex-1">
              <div className="text-[13px] text-brand-ink-muted">Next bid</div>
              <div className="font-display text-xl font-extrabold" data-testid="next-bid">
                {formatCents(Math.ceil(minimum / 100) * 100)} or more
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex h-13 items-center justify-center rounded-xl bg-brand-tomato-strong px-7 text-lg font-bold text-white hover:bg-brand-tomato-deep"
            >
              Place Bid
            </button>
          </div>
        </div>
      ) : null}

      <BidSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        listingId={listingId}
        auctionId={initial.auctionId}
        title={title}
        coverUrl={coverUrl}
        currentLine={`${noBids ? "Starting bid" : "Current bid"} ${formatCents(state.currentPriceCents)} · Ends ${endsAtLabel}`}
        isFree={isFree}
        minimumCents={minimum}
        viewer={viewer}
        turnstileSiteKey={turnstileSiteKey}
        onPlaced={(r) => {
          setLocalLive({
            auctionId: initial.auctionId,
            currentPriceCents: r.currentPriceCents,
            bidCount: r.bidCount,
            endsAt: r.endsAt,
            extended: false,
          });
          setStanding((s) => ({
            hasBid: true,
            leading: r.leading,
            myMaxCents: s?.myMaxCents ?? null,
          }));
          refreshStanding(async () => setStanding(await myStanding(initial.auctionId)));
        }}
      />
    </>
  );
}
