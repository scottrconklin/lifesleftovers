import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { assertLocalDatabaseUrl } from "../../scripts/lib/local-db";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export const E2E_TITLE_PREFIX = "E2E auction";

function db() {
  return postgres(assertLocalDatabaseUrl(process.env.DATABASE_URL), { prepare: false, max: 1 });
}

/**
 * A live listing with an open auction, owned by a seeded seller (seller01), with a seed photo.
 * `minutes` sets how soon it ends.
 */
export async function freshAuction(
  opts: { minutes?: number; startCents?: number; sellerId?: string } = {},
) {
  const sql = db();
  try {
    const listingId = randomUUID();
    const title = `${E2E_TITLE_PREFIX} ${listingId.slice(0, 8)}`;
    const endsAt = new Date(Date.now() + (opts.minutes ?? 3 * 24 * 60) * 60_000);
    const [seller] = await sql<{ id: string }[]>`
      select id from public.users where id = ${opts.sellerId ?? "00000000-0000-4000-8000-000000000101"}`;
    const [{ metro } = { metro: "" }] = await sql<{ metro: string }[]>`
      select id as metro from public.metros where slug = 'houston'`;
    await sql`
      insert into public.listings (id, seller_id, status, title, why_its_here, category, condition,
        pickup_zip, metro_id, start_price_cents, closing_night_date, posted_at, pickup_windows)
      values (${listingId}, ${seller!.id}, 'live', ${title}, 'Testing, testing.', 'home-kitchen',
        'good', '77494', ${metro}, ${opts.startCents ?? 100}, current_date, now(),
        ${JSON.stringify([{ dayOffset: 1, block: "evening" }])}::text::jsonb)`;
    await sql`
      insert into public.listing_photos (listing_id, kind, position, storage_key, width, height, bytes)
      values (${listingId}, 'photo', 0, 'p/00000000-0000-4000-a000-000000001000.jpg', 800, 800, 0)`;
    await sql`
      insert into public.auctions (listing_id, metro_id, closing_night_date, is_free,
        start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
      values (${listingId}, ${metro}, current_date, false, ${opts.startCents ?? 100},
        ${opts.startCents ?? 100}, ${endsAt}, ${endsAt})`;
    return { listingId, title, url: `/listings/${listingId}` };
  } finally {
    await sql.end();
  }
}

export async function deleteE2eAuctions(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = db();
  try {
    await sql`delete from public.listings where title like ${E2E_TITLE_PREFIX + " %"}`;
  } finally {
    await sql.end();
  }
}
