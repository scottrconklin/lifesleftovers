import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { assertLocalDatabaseUrl } from "../../scripts/lib/local-db";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export const E2E_TITLE_PREFIX = "E2E auction";

/** The Inngest dev server the e2e run starts (playwright.config.ts), not `pnpm jobs:dev`'s. */
export const E2E_INNGEST_PORT = 8298;

function db() {
  return postgres(assertLocalDatabaseUrl(process.env.DATABASE_URL), { prepare: false, max: 1 });
}

const SEED_SELLER = "00000000-0000-4000-8000-000000000101";

/**
 * A live listing with an open auction, owned by a seeded seller (seller01), with a seed photo.
 * `minutes` sets how soon it ends.
 */
export async function freshAuction(
  opts: {
    minutes?: number;
    startCents?: number;
    sellerId?: string;
    free?: boolean;
    unsoldAction?: "relist_once" | "drop_to_free" | "end";
    /** Put it on a Closing Night in this slot. */
    night?: { id: string; slot: number };
    title?: string;
  } = {},
) {
  const sql = db();
  try {
    const listingId = randomUUID();
    const auctionId = randomUUID();
    const title = `${E2E_TITLE_PREFIX} ${opts.title ?? listingId.slice(0, 8)}`;
    const endsAt = new Date(Date.now() + (opts.minutes ?? 3 * 24 * 60) * 60_000);
    const start = opts.free ? 0 : (opts.startCents ?? 100);
    const [seller] = await sql<{ id: string }[]>`
      select id from public.users where id = ${opts.sellerId ?? SEED_SELLER}`;
    const [{ metro } = { metro: "" }] = await sql<{ metro: string }[]>`
      select id as metro from public.metros where slug = 'houston'`;
    await sql`
      insert into public.listings (id, seller_id, status, title, why_its_here, category, condition,
        pickup_zip, metro_id, is_free, start_price_cents, closing_night_date, posted_at,
        pickup_windows, unsold_action)
      values (${listingId}, ${seller!.id}, 'live', ${title}, 'Testing, testing.', 'home-kitchen',
        'good', '77494', ${metro}, ${Boolean(opts.free)}, ${start}, current_date, now(),
        ${JSON.stringify([{ dayOffset: 1, block: "evening" }])}::text::jsonb,
        ${opts.unsoldAction ?? "relist_once"})`;
    await sql`
      insert into public.listing_photos (listing_id, kind, position, storage_key, width, height, bytes)
      values (${listingId}, 'photo', 0, 'p/00000000-0000-4000-a000-000000001000.jpg', 800, 800, 0)`;
    await sql`
      insert into public.auctions (id, listing_id, metro_id, closing_night_date, closing_night_id,
        slot, is_free, start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
      values (${auctionId}, ${listingId}, ${metro}, current_date, ${opts.night?.id ?? null},
        ${opts.night?.slot ?? null}, ${Boolean(opts.free)}, ${start}, ${start}, ${endsAt},
        ${endsAt})`;
    return { listingId, auctionId, title, url: `/listings/${listingId}` };
  } finally {
    await sql.end();
  }
}

/** Wake the closing job for an auction (what posting a listing does in the app). */
export async function scheduleClose(auctionId: string, endsAt: Date): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${E2E_INNGEST_PORT}/e/e2e`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `auction-scheduled-${auctionId}-${endsAt.getTime()}`,
      name: "auction/scheduled",
      data: { auctionId },
    }),
  });
  if (!response.ok) throw new Error(`Inngest dev server: HTTP ${response.status}`);
}

/** Move an open auction's end to `seconds` from now and start its closing timer. */
export async function endAuctionIn(auctionId: string, seconds: number): Promise<void> {
  const sql = db();
  const endsAt = new Date(Date.now() + seconds * 1000);
  try {
    await sql`
      update public.auctions set ends_at = ${endsAt}, scheduled_ends_at = ${endsAt}
      where id = ${auctionId} and status = 'open'`;
  } finally {
    await sql.end();
  }
  await scheduleClose(auctionId, endsAt);
}

/** A Houston Closing Night that started a minute ago (the live view shows the earliest one). */
export async function liveClosingNight(): Promise<{ id: string }> {
  const sql = db();
  try {
    const startsAt = new Date(Date.now() - 60_000);
    const [night] = await sql<{ id: string }[]>`
      insert into public.closing_nights (metro_id, date, starts_at, ends_at, next_slot)
      select id, (now() at time zone time_zone)::date, ${startsAt},
        ${new Date(startsAt.getTime() + 2 * 60 * 60_000)}, 100
      from public.metros where slug = 'houston'
      returning id`;
    return night!;
  } finally {
    await sql.end();
  }
}

/** A bid straight into the database (no soft close): `bidderId` leads at `priceCents`. */
export async function leadingBid(auctionId: string, bidderId: string, priceCents: number) {
  const sql = db();
  try {
    await sql`
      insert into public.bids (auction_id, bidder_id, max_cents) values (${auctionId}, ${bidderId}, ${priceCents})`;
    await sql`
      update public.auctions set current_price_cents = ${priceCents}, high_bidder_id = ${bidderId},
        high_max_cents = ${priceCents}, bid_count = bid_count + 1
      where id = ${auctionId}`;
  } finally {
    await sql.end();
  }
}

export async function deleteE2eAuctions(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = db();
  try {
    const titles = E2E_TITLE_PREFIX + " %";
    // Orders are the money record and block deleting a listing; test ones go first.
    await sql`
      delete from public.orders where listing_id in
        (select id from public.listings where title like ${titles})`;
    await sql`delete from public.listings where title like ${titles}`;
    // Closing Nights left with no auctions (the tests' live nights and relist nights).
    await sql`
      delete from public.closing_nights n
      where not exists (select 1 from public.auctions a where a.closing_night_id = n.id)`;
  } finally {
    await sql.end();
  }
}
