import "server-only";
import { listingBidCount } from "@/server/auctions/service";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { marketplaceConfig } from "@/config/marketplace";
import { getDb, getSql } from "@/db/client";
import { METERS_PER_MILE } from "@/db/geography";
import {
  listingPhotos,
  listings,
  metros,
  users,
  type ListingPhotoRow,
  type ListingRow,
} from "@/db/schema";

/** Bids so far on the listing's auction: the edit rules ("before the first bid") use it. */
export async function bidCountFor(listingId: string): Promise<number> {
  return listingBidCount(listingId);
}

export async function createDraft(sellerId: string): Promise<string> {
  const [row] = await getDb().insert(listings).values({ sellerId }).returning({ id: listings.id });
  return row!.id;
}

/** The seller's own listing, or undefined (never someone else's). */
export async function findOwnListing(
  listingId: string,
  sellerId: string,
): Promise<ListingRow | undefined> {
  if (!isUuid(listingId)) return undefined;
  const [row] = await getDb()
    .select()
    .from(listings)
    .where(and(eq(listings.id, listingId), eq(listings.sellerId, sellerId)))
    .limit(1);
  return row;
}

export async function listPhotos(listingId: string): Promise<ListingPhotoRow[]> {
  return getDb()
    .select()
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId))
    .orderBy(asc(listingPhotos.position));
}

/** Add a processed photo at the next position. Locks the listing row so positions never collide. */
export async function addPhoto(
  listingId: string,
  photo: Omit<ListingPhotoRow, "listingId" | "position" | "createdAt">,
): Promise<ListingPhotoRow> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select id from public.listings where id = ${listingId} for update`);
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`coalesce(max(${listingPhotos.position}) + 1, 0)::int` })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, listingId));
    const [row] = await tx
      .insert(listingPhotos)
      .values({ ...photo, listingId, position: next })
      .returning();
    return row!;
  });
}

/** Remove a photo; returns its storage key so the file can be deleted too. */
export async function removePhoto(listingId: string, photoId: string): Promise<string | null> {
  if (!isUuid(photoId)) return null;
  const [row] = await getDb()
    .delete(listingPhotos)
    .where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.id, photoId)))
    .returning({ storageKey: listingPhotos.storageKey });
  return row?.storageKey ?? null;
}

/** Move a photo to the front (the cover; for a lot, the "everything together" shot). */
export async function makeCover(listingId: string, photoId: string): Promise<void> {
  if (!isUuid(photoId)) return;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select id from public.listings where id = ${listingId} for update`);
    const rows = await tx
      .select({ id: listingPhotos.id })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, listingId))
      .orderBy(asc(listingPhotos.position));
    const order = [photoId, ...rows.map((r) => r.id).filter((id) => id !== photoId)];
    if (!rows.some((r) => r.id === photoId)) return;
    // Two passes through negative positions keep the unique index happy.
    for (const [i, id] of order.entries()) {
      await tx
        .update(listingPhotos)
        .set({ position: -1 - i })
        .where(eq(listingPhotos.id, id));
    }
    for (const [i, id] of order.entries()) {
      await tx.update(listingPhotos).set({ position: i }).where(eq(listingPhotos.id, id));
    }
  });
}

export async function updateListing(
  listingId: string,
  values: Partial<Omit<ListingRow, "id" | "sellerId" | "createdAt">>,
): Promise<void> {
  await getDb().update(listings).set(values).where(eq(listings.id, listingId));
}

export type SellerListing = Pick<
  ListingRow,
  | "id"
  | "status"
  | "title"
  | "startPriceCents"
  | "isFree"
  | "isLot"
  | "closingNightDate"
  | "updatedAt"
> & { coverKey: string | null; metroStatus: string | null; metroShortName: string | null };

export async function sellerListings(sellerId: string): Promise<SellerListing[]> {
  const rows = await getDb()
    .select({
      id: listings.id,
      status: listings.status,
      title: listings.title,
      startPriceCents: listings.startPriceCents,
      isFree: listings.isFree,
      isLot: listings.isLot,
      closingNightDate: listings.closingNightDate,
      updatedAt: listings.updatedAt,
      metroStatus: metros.status,
      metroShortName: metros.shortName,
    })
    .from(listings)
    .leftJoin(metros, eq(metros.id, listings.metroId))
    .where(eq(listings.sellerId, sellerId))
    .orderBy(desc(listings.updatedAt));
  const covers = await coverKeys(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, coverKey: covers.get(r.id) ?? null }));
}

async function coverKeys(listingIds: string[]): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ listingId: listingPhotos.listingId, key: listingPhotos.storageKey })
    .from(listingPhotos)
    .where(and(inArray(listingPhotos.listingId, listingIds), eq(listingPhotos.position, 0)));
  return new Map(rows.map((r) => [r.listingId, r.key]));
}

/** Live listings in a metro: "21 of 50 listings to open" on the waitlist screen. */
export async function liveListingCount(metroId: string): Promise<number> {
  const [row] = await getSql()<{ n: number }[]>`
    select count(*)::int as n from public.listings where metro_id = ${metroId} and status = 'live'`;
  return row?.n ?? 0;
}

/** A listing anyone may see: live, in an open metro. Owners see their own through findOwnListing. */
export async function findPublicListing(listingId: string) {
  if (!isUuid(listingId)) return undefined;
  const [row] = await getDb()
    .select({ listing: listings, sellerName: users.displayName, metroStatus: metros.status })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.sellerId))
    .innerJoin(metros, eq(metros.id, listings.metroId))
    .where(and(eq(listings.id, listingId), eq(listings.status, "live"), eq(metros.status, "open")))
    .limit(1);
  return row;
}

export type NearbyListing = {
  id: string;
  title: string;
  startPriceCents: number;
  isFree: boolean;
  isLot: boolean;
  lotItemCount: number | null;
  closingNightDate: string | null;
  areaName: string | null;
  miles: number;
  coverKey: string | null;
  /** From the open auction (the start price and 0 bids before it exists). */
  currentPriceCents: number;
  bidCount: number;
  endsAt: Date | null;
  timeZone: string;
};

/**
 * Live listings in the viewer's (open) metro within the slider's maximum, nearest first, with
 * zip-centroid distances. The radius to show is chosen from these by chooseRadius().
 */
export async function nearbyLiveListings(
  originZip: string,
  metroId: string,
  maxMiles: number = marketplaceConfig.radius.maxMiles,
): Promise<NearbyListing[]> {
  const rows = await getSql()<
    Array<{
      id: string;
      title: string;
      start_price_cents: number;
      is_free: boolean;
      is_lot: boolean;
      lot_item_count: number | null;
      closing_night_date: string | null;
      area_name: string | null;
      miles: number;
      cover_key: string | null;
      current_price_cents: number | null;
      bid_count: number | null;
      ends_at: Date | null;
      time_zone: string;
    }>
  >`
    select l.id, l.title, l.start_price_cents, l.is_free, l.is_lot, l.lot_item_count,
      l.closing_night_date::text as closing_night_date, a.name as area_name,
      extensions.st_distance(z.location, o.location) / ${METERS_PER_MILE}::float8 as miles,
      (select p.storage_key from public.listing_photos p
        where p.listing_id = l.id order by p.position limit 1) as cover_key,
      au.current_price_cents, au.bid_count, au.ends_at, m.time_zone
    from public.listings l
    join public.metros m on m.id = l.metro_id and m.status = 'open'
    left join public.auctions au on au.listing_id = l.id and au.status = 'open'
    join public.zip_codes z on z.zip = l.pickup_zip
    left join public.areas a on a.id = z.area_id
    join public.zip_codes o on o.zip = ${originZip}
    where l.status = 'live' and l.metro_id = ${metroId}
      and extensions.st_dwithin(z.location, o.location, ${maxMiles * METERS_PER_MILE}::float8)
    order by miles, l.posted_at desc`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startPriceCents: r.start_price_cents,
    isFree: r.is_free,
    isLot: r.is_lot,
    lotItemCount: r.lot_item_count,
    closingNightDate: r.closing_night_date,
    areaName: r.area_name,
    miles: Number(r.miles),
    coverKey: r.cover_key,
    currentPriceCents: r.current_price_cents ?? r.start_price_cents,
    bidCount: r.bid_count ?? 0,
    endsAt: r.ends_at,
    timeZone: r.time_zone,
  }));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** What buyers see about a seller on the item page (ratings and sales arrive with M7). */
export async function sellerSummary(
  sellerId: string,
): Promise<{ displayName: string | null; phoneVerified: boolean }> {
  const [row] = await getDb()
    .select({ displayName: users.displayName, phoneVerifiedAt: users.phoneVerifiedAt })
    .from(users)
    .where(eq(users.id, sellerId))
    .limit(1);
  return { displayName: row?.displayName ?? null, phoneVerified: Boolean(row?.phoneVerifiedAt) };
}
