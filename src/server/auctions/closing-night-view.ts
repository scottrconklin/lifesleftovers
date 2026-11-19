import "server-only";
import { getSql } from "@/db/client";

/**
 * What the Closing Night live view shows (mockup ClosingNight.dc.html): the item closing now, the
 * next few, and what just sold. Public facts only: prices, counts and end times, never bidders.
 */

export type LiveItem = {
  auctionId: string;
  listingId: string;
  title: string;
  isFree: boolean;
  isLot: boolean;
  lotItemCount: number | null;
  startPriceCents: number;
  currentPriceCents: number;
  bidCount: number;
  endsAt: Date;
  scheduledEndsAt: Date;
  coverKey: string | null;
  areaName: string | null;
};

export type ClosedItem = {
  auctionId: string;
  listingId: string;
  title: string;
  outcome: "sold" | "claimed";
  priceCents: number;
};

export type ClosingNightView = {
  metroId: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date;
  /** Items on the night (cancelled ones aren't counted). */
  total: number;
  closedCount: number;
  current: LiveItem | null;
  upNext: LiveItem[];
  justSold: ClosedItem[];
};

const UP_NEXT = 3;
const JUST_SOLD = 3;

type NightRow = { id: string; starts_at: Date; ends_at: Date; time_zone: string };

/**
 * The night to show: the earliest one that still has open auctions; else the last one, while
 * it's recent enough to show its results.
 */
async function pickNight(metroId: string, now: Date): Promise<NightRow | null> {
  const sql = getSql();
  const [live] = await sql<NightRow[]>`
    select n.id, n.starts_at, n.ends_at, m.time_zone
    from public.closing_nights n join public.metros m on m.id = n.metro_id
    where n.metro_id = ${metroId}
      and exists (select 1 from public.auctions a
        where a.closing_night_id = n.id and a.status = 'open')
    order by n.starts_at limit 1`;
  if (live) return live;
  const [recent] = await sql<NightRow[]>`
    select n.id, n.starts_at, n.ends_at, m.time_zone
    from public.closing_nights n join public.metros m on m.id = n.metro_id
    where n.metro_id = ${metroId} and n.starts_at <= ${now}
      and n.ends_at > ${now}::timestamptz - interval '12 hours'
    order by n.starts_at desc limit 1`;
  return recent ?? null;
}

export async function closingNightView(
  metroId: string,
  now = new Date(),
): Promise<ClosingNightView | null> {
  const night = await pickNight(metroId, now);
  if (!night) return null;
  const sql = getSql();

  const [counts] = await sql<{ total: number; closed: number }[]>`
    select count(*)::int as total,
      count(*) filter (where status in ('sold', 'unsold'))::int as closed
    from public.auctions where closing_night_id = ${night.id} and status <> 'cancelled'`;

  const open = await sql<
    Array<{
      auction_id: string;
      listing_id: string;
      title: string | null;
      is_free: boolean;
      is_lot: boolean;
      lot_item_count: number | null;
      start_price_cents: number;
      current_price_cents: number;
      bid_count: number;
      ends_at: Date;
      scheduled_ends_at: Date;
      cover_key: string | null;
      area_name: string | null;
    }>
  >`
    select a.id as auction_id, l.id as listing_id, l.title, a.is_free, l.is_lot, l.lot_item_count,
      a.start_price_cents, a.current_price_cents, a.bid_count, a.ends_at, a.scheduled_ends_at,
      (select p.storage_key from public.listing_photos p
        where p.listing_id = l.id and p.kind = 'photo' order by p.position limit 1) as cover_key,
      ar.name as area_name
    from public.auctions a
    join public.listings l on l.id = a.listing_id
    left join public.zip_codes z on z.zip = l.pickup_zip
    left join public.areas ar on ar.id = z.area_id
    where a.closing_night_id = ${night.id} and a.status = 'open'
    order by a.ends_at, a.slot
    limit ${UP_NEXT + 1}`;

  const sold = await sql<
    Array<{
      auction_id: string;
      listing_id: string;
      title: string | null;
      kind: "sale" | "free_claim";
      price_cents: number;
    }>
  >`
    select a.id as auction_id, l.id as listing_id, l.title, o.kind, o.price_cents
    from public.auctions a
    join public.listings l on l.id = a.listing_id
    join public.orders o on o.auction_id = a.id
    where a.closing_night_id = ${night.id} and a.status = 'sold'
    order by a.closed_at desc
    limit ${JUST_SOLD}`;

  const items: LiveItem[] = open.map((r) => ({
    auctionId: r.auction_id,
    listingId: r.listing_id,
    title: r.title ?? "Untitled",
    isFree: r.is_free,
    isLot: r.is_lot,
    lotItemCount: r.lot_item_count,
    startPriceCents: r.start_price_cents,
    currentPriceCents: r.current_price_cents,
    bidCount: r.bid_count,
    endsAt: r.ends_at,
    scheduledEndsAt: r.scheduled_ends_at,
    coverKey: r.cover_key,
    areaName: r.area_name,
  }));

  return {
    metroId,
    timeZone: night.time_zone,
    startsAt: night.starts_at,
    endsAt: night.ends_at,
    total: counts?.total ?? 0,
    closedCount: counts?.closed ?? 0,
    current: items[0] ?? null,
    upNext: items.slice(1),
    justSold: sold.map((r) => ({
      auctionId: r.auction_id,
      listingId: r.listing_id,
      title: r.title ?? "Untitled",
      outcome: r.kind === "free_claim" ? "claimed" : "sold",
      priceCents: r.price_cents,
    })),
  };
}

/** When the metro's next (or current) Closing Night starts, for the wall's banner. */
export async function nextClosingNightStart(metroId: string): Promise<Date | null> {
  const [row] = await getSql()<{ starts_at: Date }[]>`
    select n.starts_at from public.closing_nights n
    where n.metro_id = ${metroId}
      and exists (select 1 from public.auctions a
        where a.closing_night_id = n.id and a.status = 'open')
    order by n.starts_at limit 1`;
  return row?.starts_at ?? null;
}
