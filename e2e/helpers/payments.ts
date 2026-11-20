import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { assertLocalDatabaseUrl } from "../../scripts/lib/local-db";
import { freshAuction } from "./auctions";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Test cards get this fingerprint prefix, so teardown can find them on seeded members. */
const E2E_FINGERPRINT = "e2e_fp_";

function db() {
  return postgres(assertLocalDatabaseUrl(process.env.DATABASE_URL), { prepare: false, max: 1 });
}

export async function userIdForEmail(email: string): Promise<string> {
  const sql = db();
  try {
    const [row] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`;
    if (!row) throw new Error("no such user");
    return row.id;
  } finally {
    await sql.end();
  }
}

/** Give a member a default card for the fake gateway (one that declines, if asked). */
export async function giveCard(userId: string, opts: { declines?: boolean } = {}) {
  const sql = db();
  try {
    await sql`update public.user_cards set is_default = false where user_id = ${userId}`;
    await sql`
      insert into public.user_cards (user_id, payment_method_id, fingerprint, brand, last4,
        exp_month, exp_year, is_default)
      values (${userId}, ${`fake_pm_${opts.declines ? "decline_" : ""}${randomUUID()}`},
        ${E2E_FINGERPRINT + randomUUID()}, 'visa', ${opts.declines ? "0002" : "4242"}, 12, 2030,
        true)`;
  } finally {
    await sql.end();
  }
}

/** The auction's live order, once closing has made one. */
export async function orderForAuction(auctionId: string) {
  const sql = db();
  try {
    const [row] = await sql<{ id: string; status: string }[]>`
      select id, status from public.orders where auction_id = ${auctionId} and cancelled_at is null`;
    return row ?? null;
  } finally {
    await sql.end();
  }
}

/**
 * A closed, sold auction with an order for `buyerId` already in `status` (a second-chance offer,
 * or paid and waiting for pickup), skipping the closing and charging steps.
 */
export async function orderInState(opts: {
  buyerId: string;
  status: "offered" | "paid";
  priceCents: number;
}) {
  const auction = await freshAuction({ minutes: 5, startCents: opts.priceCents });
  const sql = db();
  try {
    await sql`
      update public.auctions set status = 'sold', closed_at = now(), bid_count = 2,
        high_bidder_id = ${opts.buyerId}, high_max_cents = ${opts.priceCents},
        current_price_cents = ${opts.priceCents}
      where id = ${auction.auctionId}`;
    await sql`update public.listings set status = 'sold' where id = ${auction.listingId}`;
    const premium = Math.max(100, Math.round(opts.priceCents / 10));
    const paid = opts.status === "paid";
    const [row] = await sql<{ id: string }[]>`
      insert into public.orders (auction_id, listing_id, buyer_id, seller_id, kind, status,
        price_cents, premium_cents, total_cents, seller_payout_cents, second_chance,
        offer_expires_at, payment_intent_id, card_brand, card_last4, paid_at, release_after)
      select ${auction.auctionId}, ${auction.listingId}, ${opts.buyerId}, l.seller_id, 'sale',
        ${opts.status}, ${opts.priceCents}, ${premium}, ${opts.priceCents + premium},
        ${opts.priceCents}, ${!paid}, ${paid ? null : new Date(Date.now() + 86_400_000)},
        ${paid ? `fake_pi_${randomUUID()}` : null}, ${paid ? "visa" : null},
        ${paid ? "4242" : null}, ${paid ? new Date() : null},
        ${paid ? new Date(Date.now() + 4 * 86_400_000) : null}
      from public.listings l where l.id = ${auction.listingId}
      returning id`;
    return { ...auction, orderId: row!.id, totalCents: opts.priceCents + premium };
  } finally {
    await sql.end();
  }
}

/** Teardown: test cards left on seeded members. */
export async function deleteE2eCards(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const sql = db();
  try {
    await sql`delete from public.user_cards where fingerprint like ${E2E_FINGERPRINT + "%"}`;
  } finally {
    await sql.end();
  }
}
