"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { myStanding } from "@/app/bid/actions";
import { BidSheet, type BidSheetViewer } from "@/components/item/BidSheet";
import { Countdown } from "@/components/item/Countdown";
import type { Standing } from "@/components/item/AuctionPanel";
import { minimumBidCents } from "@/lib/bidding";
import { realtimeClient, useLiveAuction } from "@/lib/client/use-live-auction";
import { useServerNow } from "@/lib/client/use-server-clock";
import { formatCents } from "@/lib/money";
import { isAuctionClosed, type AuctionUpdate } from "@/lib/realtime";

export type LiveItemView = {
  auctionId: string;
  listingId: string;
  title: string;
  isFree: boolean;
  lotLabel: string | null;
  startPriceCents: number;
  currentPriceCents: number;
  bidCount: number;
  endsAt: string;
  scheduledEndsAt: string;
  /** "7:44 PM" */
  time: string;
  coverUrl: string | null;
  thumbUrl: string | null;
  areaName: string | null;
};

export type LiveViewData = {
  metroId: string;
  metroName: string;
  timeZone: string;
  startsAt: string;
  startsAtLabel: string;
  /** Whether it had started when the server rendered (the clock takes over after hydration). */
  startedAtRender: boolean;
  total: number;
  closedCount: number;
  current: LiveItemView | null;
  upNext: LiveItemView[];
  justSold: Array<{
    auctionId: string;
    listingId: string;
    title: string;
    outcome: "sold" | "claimed";
    priceCents: number;
  }>;
};

/** Reload this long after an item's end if the "closed" broadcast hasn't arrived. */
const CLOSE_RECHECK_MS = 15_000;

export function ClosingNightLive({
  data,
  viewer,
  initialStanding,
  turnstileSiteKey,
}: {
  data: LiveViewData;
  viewer: BidSheetViewer;
  initialStanding: Standing | null;
  turnstileSiteKey: string | null;
}) {
  const router = useRouter();
  const now = useServerNow();
  const started = now === null ? data.startedAtRender : now.getTime() >= Date.parse(data.startsAt);

  // Any item on tonight's list closing moves the queue along.
  useEffect(() => {
    const supabase = realtimeClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`closing:${data.metroId}`)
      .on("broadcast", { event: "closed" }, ({ payload }) => {
        if (isAuctionClosed(payload)) router.refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.metroId, router]);

  const position = Math.min(data.closedCount + 1, data.total);
  const subtitle = data.current
    ? started
      ? `${data.current.areaName ? `${data.current.areaName} area · ` : ""}item ${position} of ${data.total}`
      : `${data.metroName} · ${data.total} ${data.total === 1 ? "item" : "items"} · starts ${data.startsAtLabel}`
    : `${data.metroName} · that's a wrap`;

  return (
    <div className="flex flex-1 flex-col bg-brand-cream text-brand-navy">
      <header className="flex items-center justify-between bg-brand-navy px-5 pt-4.5 pb-4 text-white">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            aria-label="Back to the wall"
            className="-ml-2.5 flex size-11 items-center justify-center text-white"
          >
            <ChevronLeft aria-hidden="true" className="size-5.5" strokeWidth={2.2} />
          </Link>
          <div>
            <h1 className="font-display text-[19px] font-extrabold">Closing Night</h1>
            <div className="text-[13px] text-[#D9E1EA]" data-testid="closing-subtitle">
              {subtitle}
            </div>
          </div>
        </div>
        {started && data.current ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-mustard px-2.5 py-1 text-xs font-extrabold tracking-wider text-brand-navy">
            <span aria-hidden="true" className="size-2 rounded-full bg-brand-tomato-strong" />
            LIVE
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-3.5 px-5 pt-4 pb-10">
        {data.current ? (
          <CurrentItem
            item={data.current}
            started={started}
            startsAtLabel={data.startsAtLabel}
            timeZone={data.timeZone}
            viewer={viewer}
            initialStanding={initialStanding}
            turnstileSiteKey={turnstileSiteKey}
          />
        ) : (
          <section className="rounded-[14px] bg-white p-4">
            <h2 className="font-display text-xl font-extrabold">That&apos;s a wrap</h2>
            <p className="mt-1 text-[15px]">
              Every item on this Closing Night has closed. See you next week.
            </p>
          </section>
        )}

        {data.upNext.length > 0 ? (
          <section aria-labelledby="next">
            <h2 id="next" className="mb-2 font-display text-base font-extrabold">
              Up next
            </h2>
            <ul className="rounded-xl bg-white">
              {data.upNext.map((row) => (
                <li key={row.auctionId} className="border-b border-[#EFE6D7] last:border-b-0">
                  <Link
                    href={`/listings/${row.listingId}`}
                    className="flex min-h-11 items-center gap-3 px-3.5 py-2.5"
                  >
                    <span className="w-16 text-[13px] font-bold">{row.time}</span>
                    <span className="flex-1 truncate text-sm">{row.title}</span>
                    <span className="text-sm font-bold">
                      {row.isFree && row.bidCount === 0
                        ? "Free"
                        : formatCents(row.currentPriceCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data.justSold.length > 0 ? (
          <section aria-labelledby="sold">
            <h2 id="sold" className="mb-2 font-display text-base font-extrabold">
              Just sold
            </h2>
            <ul className="flex flex-col gap-2">
              {data.justSold.map((row) => (
                <li key={row.auctionId}>
                  <Link
                    href={`/listings/${row.listingId}`}
                    className="flex min-h-11 items-center gap-3 rounded-xl bg-white px-3.5 py-2.5"
                  >
                    <span className="flex-1 truncate text-sm">{row.title}</span>
                    <span className="rounded-md bg-brand-avocado px-2 py-0.75 text-xs font-bold text-white">
                      {row.outcome === "claimed"
                        ? "Claimed"
                        : `Sold ${formatCents(row.priceCents)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function CurrentItem({
  item,
  started,
  startsAtLabel,
  timeZone,
  viewer,
  initialStanding,
  turnstileSiteKey,
}: {
  item: LiveItemView;
  started: boolean;
  startsAtLabel: string;
  timeZone: string;
  viewer: BidSheetViewer;
  initialStanding: Standing | null;
  turnstileSiteKey: string | null;
}) {
  const router = useRouter();
  const [standing, setStanding] = useState(initialStanding);
  const [, refreshStanding] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [local, setLocal] = useState<AuctionUpdate | null>(null);
  const live = useLiveAuction(
    {
      auctionId: item.auctionId,
      currentPriceCents: item.currentPriceCents,
      bidCount: item.bidCount,
      endsAt: item.endsAt,
      extended: false,
    },
    () => {
      if (viewer.kind === "member") {
        refreshStanding(async () => setStanding(await myStanding(item.auctionId)));
      }
    },
  );
  const state = local && local.bidCount > live.bidCount ? local : live;
  const now = useServerNow();
  const ended = now !== null && now.getTime() >= Date.parse(state.endsAt);

  useEffect(() => {
    if (!ended) return;
    const timer = setTimeout(() => router.refresh(), CLOSE_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [ended, router]);

  const minimum = minimumBidCents({
    isFree: item.isFree,
    startPriceCents: item.startPriceCents,
    currentPriceCents: state.currentPriceCents,
    highBidderId: null,
    highMaxCents: null,
    bidCount: state.bidCount,
  });
  const nextBid = Math.ceil(minimum / 100) * 100;
  const noBids = state.bidCount === 0;
  const you =
    viewer.kind !== "member" || !standing?.hasBid
      ? "you're not bidding"
      : standing.leading
        ? "you're winning"
        : "you've been outbid";

  return (
    <section aria-labelledby="now" className="overflow-hidden rounded-[14px] bg-white">
      <div className="relative flex h-47.5 items-center justify-center bg-[#E9DFCE]">
        {item.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- CDN-sized listing photo
          <img src={item.coverUrl} alt="" className="size-full object-cover" />
        ) : null}
        {item.lotLabel ? (
          <span className="absolute top-2.5 left-2.5 rounded-md border-[1.5px] border-brand-navy bg-white px-2 py-0.5 text-[11px] font-bold tracking-wide">
            {item.lotLabel}
          </span>
        ) : null}
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <div className="text-xs font-bold tracking-wider text-brand-ink-muted">
          {!started ? `FIRST UP · ${item.time}` : ended ? "CLOSING…" : "CLOSING NOW"}
        </div>
        <h2 id="now" className="mt-0.5 font-display text-[21px] font-extrabold">
          <Link href={`/listings/${item.listingId}`}>{item.title}</Link>
        </h2>
        <div className="mt-2.5 flex items-end justify-between gap-3">
          <div>
            <div
              className="font-display text-[30px] leading-none font-extrabold"
              data-testid="live-price"
            >
              {item.isFree && noBids ? "Free" : formatCents(state.currentPriceCents)}
            </div>
            <div className="text-[13px] text-brand-ink-muted">
              {state.bidCount} {state.bidCount === 1 ? "bid" : "bids"} · {you}
            </div>
          </div>
          <div className="text-right">
            {started ? (
              <Countdown
                endsAt={state.endsAt}
                scheduledEndsAt={item.scheduledEndsAt}
                timeZone={timeZone}
                bidCount={state.bidCount}
                currentPriceCents={state.currentPriceCents}
                relists
                initialText=""
                className="font-display text-[40px] leading-none font-extrabold"
              />
            ) : (
              <div className="text-sm font-bold">Starts {startsAtLabel}</div>
            )}
          </div>
        </div>
        {!ended ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="mt-3.5 flex h-13 w-full items-center justify-center rounded-xl bg-brand-tomato-strong text-lg font-bold text-white hover:bg-brand-tomato-deep"
          >
            Place Bid · {formatCents(nextBid)}
          </button>
        ) : null}
      </div>
      <BidSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        listingId={item.listingId}
        auctionId={item.auctionId}
        title={item.title}
        coverUrl={item.thumbUrl}
        currentLine={`${noBids ? "Starting bid" : "Current bid"} ${formatCents(state.currentPriceCents)} · closes ${item.time}`}
        isFree={item.isFree}
        minimumCents={minimum}
        viewer={viewer}
        turnstileSiteKey={turnstileSiteKey}
        onPlaced={(r) => {
          setLocal({
            auctionId: item.auctionId,
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
          refreshStanding(async () => setStanding(await myStanding(item.auctionId)));
        }}
      />
    </section>
  );
}
