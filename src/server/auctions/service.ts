import "server-only";
import { marketplaceConfig } from "@/config/marketplace";
import { getSql } from "@/db/client";
import { applyBid, softCloseEndsAt, type AuctionState } from "@/lib/bidding";
import {
  claimSlot,
  fastClockOn,
  METRO_SCHEDULE_COLUMNS,
  metroScheduleFromRow,
  nightForListing,
  scheduleClosing,
} from "./schedule";

/**
 * Auctions and bids. Every bid runs in ONE transaction that locks the auction row
 * (SELECT … FOR UPDATE), then applies the proxy rules (CLAUDE.md "Bidding and closing"): two
 * simultaneous bids can never both win, and the second always sees the first one's price.
 */

export type BidRefusal =
  | { ok: false; reason: "not-found" | "ended" | "own-item" | "linked-to-seller" | "rate-limited" }
  | { ok: false; reason: "too-low"; minimumCents: number }
  | { ok: false; reason: "not-above-your-max"; yourMaxCents: number };

export type BidAccepted = {
  ok: true;
  leading: boolean;
  raisedOwnMax: boolean;
  currentPriceCents: number;
  bidCount: number;
  endsAt: Date;
  extended: boolean;
  /** The member who just lost the lead (for the outbid notice in M9). */
  outbidUserId: string | null;
};

type LockedAuction = {
  id: string;
  status: string;
  is_free: boolean;
  start_price_cents: number;
  current_price_cents: number;
  high_bidder_id: string | null;
  high_max_cents: number | null;
  bid_count: number;
  ends_at: Date;
  seller_id: string;
};

export async function placeBid(input: {
  auctionId: string;
  bidderId: string;
  maxCents: number;
  /** Hash of the bidder's device cookie, if any. */
  deviceHash: string | null;
  now?: Date;
}): Promise<BidAccepted | BidRefusal> {
  const now = input.now ?? new Date();
  const { maxPerMinute, maxPerHour } = marketplaceConfig.bids;

  return getSql().begin(async (tx) => {
    const [recent] = await tx<{ minute: number; hour: number }[]>`
      select
        count(*) filter (where created_at > ${now}::timestamptz - interval '1 minute')::int as minute,
        count(*)::int as hour
      from public.bids
      where bidder_id = ${input.bidderId} and created_at > ${now}::timestamptz - interval '1 hour'`;
    if ((recent?.minute ?? 0) >= maxPerMinute || (recent?.hour ?? 0) >= maxPerHour) {
      return { ok: false, reason: "rate-limited" } as const;
    }

    const [auction] = await tx<LockedAuction[]>`
      select a.id, a.status, a.is_free, a.start_price_cents, a.current_price_cents,
        a.high_bidder_id, a.high_max_cents, a.bid_count, a.ends_at, l.seller_id
      from public.auctions a
      join public.listings l on l.id = a.listing_id
      where a.id = ${input.auctionId}
      for update of a`;
    if (!auction) return { ok: false, reason: "not-found" } as const;
    if (auction.status !== "open" || now >= auction.ends_at) {
      return { ok: false, reason: "ended" } as const;
    }
    if (auction.seller_id === input.bidderId) return { ok: false, reason: "own-item" } as const;

    // Accounts that share the seller's phone, a card or a device can't bid (SPEC "Fake bidding").
    const [link] = await tx<{ linked: boolean }[]>`
      select (
        exists (
          select 1 from public.users s join public.users b on b.phone_e164 = s.phone_e164
          where s.id = ${auction.seller_id} and b.id = ${input.bidderId}
        )
        or exists (
          select 1 from public.user_cards sc
          join public.user_cards bc on bc.fingerprint = sc.fingerprint
          where sc.user_id = ${auction.seller_id} and bc.user_id = ${input.bidderId}
        )
        or exists (
          select 1 from public.user_devices sd
          join public.user_devices bd on bd.device_hash = sd.device_hash
          where sd.user_id = ${auction.seller_id} and bd.user_id = ${input.bidderId}
        )
        or exists (
          select 1 from public.user_devices
          where user_id = ${auction.seller_id} and device_hash = ${input.deviceHash}
        )
      ) as linked`;
    if (link?.linked) return { ok: false, reason: "linked-to-seller" } as const;

    const state: AuctionState = {
      isFree: auction.is_free,
      startPriceCents: auction.start_price_cents,
      currentPriceCents: auction.current_price_cents,
      highBidderId: auction.high_bidder_id,
      highMaxCents: auction.high_max_cents,
      bidCount: auction.bid_count,
    };
    const result = applyBid(state, input.bidderId, input.maxCents);
    if (!result.ok) return result;

    const close = softCloseEndsAt(now, auction.ends_at);
    await tx`
      update public.auctions set
        current_price_cents = ${result.state.currentPriceCents},
        high_bidder_id = ${result.state.highBidderId},
        high_max_cents = ${result.state.highMaxCents},
        bid_count = ${result.state.bidCount},
        ends_at = ${close.endsAt},
        updated_at = ${now}
      where id = ${auction.id}`;
    await tx`
      insert into public.bids (auction_id, bidder_id, max_cents, created_at)
      values (${auction.id}, ${input.bidderId}, ${input.maxCents}, ${now})`;

    return {
      ok: true,
      leading: result.leading,
      raisedOwnMax: result.raisedOwnMax,
      currentPriceCents: result.state.currentPriceCents,
      bidCount: result.state.bidCount,
      endsAt: close.endsAt,
      extended: close.extended,
      outbidUserId: result.outbidUserId,
    } as const;
  });
}

/**
 * Open (or refresh) the auction for a live listing in an open metro. A new auction takes the next
 * one-minute slot on its Closing Night; edits before the first bid refresh the price and keep the
 * slot unless the seller picked a different night. Once bids exist, nothing changes here.
 */
export async function syncAuctionForListing(listingId: string, now = new Date()): Promise<void> {
  const sql = getSql();
  const [row] = await sql<
    ({
      status: string;
      metro_status: string;
      closing_night_date: string | null;
      is_free: boolean;
      start_price_cents: number;
    } & Parameters<typeof metroScheduleFromRow>[0])[]
  >`
    select l.status, m.status as metro_status, l.closing_night_date::text as closing_night_date,
      l.is_free, l.start_price_cents, ${sql.unsafe(METRO_SCHEDULE_COLUMNS)}
    from public.listings l join public.metros m on m.id = l.metro_id
    where l.id = ${listingId}`;
  if (!row || row.status !== "live" || row.metro_status !== "open" || !row.closing_night_date) {
    return;
  }
  const schedule = metroScheduleFromRow(row);
  const chosenDate = row.closing_night_date;
  const scheduled = await sql.begin(async (tx) => {
    const [open] = await tx<
      { id: string; bid_count: number; night_date: string | null; ends_at: Date }[]
    >`
      select a.id, a.bid_count, n.date::text as night_date, a.ends_at
      from public.auctions a left join public.closing_nights n on n.id = a.closing_night_id
      where a.listing_id = ${listingId} and a.status = 'open'
      for update of a`;
    if (open && open.bid_count > 0) return null;
    const keepSlot =
      open?.night_date != null &&
      (fastClockOn() ? open.ends_at > now : open.night_date === chosenDate);
    if (open && keepSlot) {
      await tx`
        update public.auctions set is_free = ${row.is_free},
          start_price_cents = ${row.start_price_cents},
          current_price_cents = ${row.start_price_cents}, updated_at = now()
        where id = ${open.id}`;
      return null;
    }
    const slot = await claimSlot(
      tx,
      schedule,
      await nightForListing(tx, schedule, chosenDate, now),
    );
    if (slot.date !== chosenDate) {
      // Fast clock: the listing shows the fast night's date.
      await tx`update public.listings set closing_night_date = ${slot.date} where id = ${listingId}`;
    }
    if (open) {
      await tx`
        update public.auctions set is_free = ${row.is_free},
          start_price_cents = ${row.start_price_cents},
          current_price_cents = ${row.start_price_cents}, closing_night_date = ${slot.date},
          closing_night_id = ${slot.closingNightId}, slot = ${slot.slot},
          ends_at = ${slot.endsAt}, scheduled_ends_at = ${slot.endsAt}, updated_at = now()
        where id = ${open.id}`;
      return { auctionId: open.id, endsAt: slot.endsAt };
    }
    const [created] = await tx<{ id: string }[]>`
      insert into public.auctions (listing_id, metro_id, closing_night_date, closing_night_id,
        slot, is_free, start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
      values (${listingId}, ${schedule.metroId}, ${slot.date}, ${slot.closingNightId},
        ${slot.slot}, ${row.is_free}, ${row.start_price_cents}, ${row.start_price_cents},
        ${slot.endsAt}, ${slot.endsAt})
      returning id`;
    return { auctionId: created!.id, endsAt: slot.endsAt };
  });
  if (scheduled) await scheduleClosing(scheduled.auctionId, scheduled.endsAt);
}

/** The seller pulled the listing before any bids. */
export async function cancelOpenAuction(listingId: string): Promise<void> {
  await getSql()`
    update public.auctions set status = 'cancelled', updated_at = now()
    where listing_id = ${listingId} and status = 'open' and bid_count = 0`;
}

export type AuctionView = {
  id: string;
  status: "open" | "closing" | "sold" | "unsold" | "cancelled";
  isFree: boolean;
  startPriceCents: number;
  currentPriceCents: number;
  bidCount: number;
  endsAt: Date;
  scheduledEndsAt: Date;
};

/** The listing's current auction (the open one, else its latest). Never includes anyone's max. */
export async function auctionForListing(listingId: string): Promise<AuctionView | null> {
  const [row] = await getSql()<
    Array<{
      id: string;
      status: AuctionView["status"];
      is_free: boolean;
      start_price_cents: number;
      current_price_cents: number;
      bid_count: number;
      ends_at: Date;
      scheduled_ends_at: Date;
    }>
  >`
    select id, status, is_free, start_price_cents, current_price_cents, bid_count, ends_at,
      scheduled_ends_at
    from public.auctions where listing_id = ${listingId}
    order by (status = 'open') desc, created_at desc limit 1`;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    isFree: row.is_free,
    startPriceCents: row.start_price_cents,
    currentPriceCents: row.current_price_cents,
    bidCount: row.bid_count,
    endsAt: row.ends_at,
    scheduledEndsAt: row.scheduled_ends_at,
  };
}

/** The viewer's own standing: only ever their own max, never anyone else's. */
export async function bidStanding(
  auctionId: string,
  userId: string,
): Promise<{ hasBid: boolean; leading: boolean; myMaxCents: number | null }> {
  const [row] = await getSql()<{ leading: boolean; my_max: number | null }[]>`
    select (a.high_bidder_id = ${userId}) as leading,
      (select max(b.max_cents) from public.bids b
        where b.auction_id = a.id and b.bidder_id = ${userId}) as my_max
    from public.auctions a where a.id = ${auctionId}`;
  if (!row) return { hasBid: false, leading: false, myMaxCents: null };
  return { hasBid: row.my_max !== null, leading: Boolean(row.leading), myMaxCents: row.my_max };
}

/** Bids on the listing's open (or latest) auction: the edit rules depend on it. */
export async function listingBidCount(listingId: string): Promise<number> {
  const [row] = await getSql()<{ n: number }[]>`
    select coalesce(max(bid_count), 0)::int as n from public.auctions
    where listing_id = ${listingId} and status <> 'cancelled'`;
  return row?.n ?? 0;
}

/** Has this member ever bid? (Turnstile and the card step happen at the first bid.) */
export async function hasEverBid(userId: string): Promise<boolean> {
  const [row] = await getSql()<{ any: boolean }[]>`
    select exists(select 1 from public.bids where bidder_id = ${userId}) as any`;
  return Boolean(row?.any);
}

/**
 * Leading an open auction, selling one that has bids, or either side of an order: account
 * deletion waits for these. (Orders are the money record and outlive the listing; until M6/M7
 * define when an order is finished, any order counts.)
 */
export async function hasActiveAuctions(userId: string): Promise<boolean> {
  const [row] = await getSql()<{ active: boolean }[]>`
    select exists (
      select 1 from public.auctions a join public.listings l on l.id = a.listing_id
      where a.status in ('open', 'closing')
        and (a.high_bidder_id = ${userId} or (l.seller_id = ${userId} and a.bid_count > 0))
    ) or exists (
      select 1 from public.orders o where o.seller_id = ${userId} or o.buyer_id = ${userId}
    ) as active`;
  return Boolean(row?.active);
}
