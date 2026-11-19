import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getSql } from "@/db/client";
import { bidStanding, cancelOpenAuction, placeBid } from "./service";

// Integration: needs `pnpm db:start && pnpm db:migrate && pnpm db:seed` (Houston must exist).
const DOMAIN = "@bids.db-test.local";
const sql = () => getSql();

async function member(): Promise<string> {
  const id = randomUUID();
  await sql()`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${id + DOMAIN}, now(), now())`;
  await sql()`insert into public.users (id, display_name) values (${id}, 'Test')`;
  return id;
}

/** A live listing with an open auction ending in `minutes`. */
async function auction(sellerId: string, opts: { start?: number; minutes?: number } = {}) {
  const [{ metro } = { metro: "" }] = await sql()<{ metro: string }[]>`
    select id as metro from public.metros where slug = 'houston'`;
  const listingId = randomUUID();
  const auctionId = randomUUID();
  const endsAt = new Date(Date.now() + (opts.minutes ?? 60 * 24) * 60_000);
  await sql()`
    insert into public.listings (id, seller_id, status, title, category, condition, pickup_zip,
      metro_id, start_price_cents, closing_night_date, posted_at)
    values (${listingId}, ${sellerId}, 'live', 'Test toaster', 'home-kitchen', 'good', '77494',
      ${metro}, ${opts.start ?? 100}, current_date, now())`;
  await sql()`
    insert into public.auctions (id, listing_id, metro_id, closing_night_date, is_free,
      start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
    values (${auctionId}, ${listingId}, ${metro}, current_date, false, ${opts.start ?? 100},
      ${opts.start ?? 100}, ${endsAt}, ${endsAt})`;
  return { listingId, auctionId, endsAt };
}

const bid = (auctionId: string, bidderId: string, maxCents: number, now?: Date) =>
  placeBid({ auctionId, bidderId, maxCents, deviceHash: null, now });

async function auctionRow(id: string) {
  const [row] = await sql()<
    {
      current_price_cents: number;
      high_bidder_id: string;
      high_max_cents: number;
      bid_count: number;
      ends_at: Date;
    }[]
  >`select current_price_cents, high_bidder_id, high_max_cents, bid_count, ends_at
    from public.auctions where id = ${id}`;
  return row!;
}

describe("bidding (database)", () => {
  let seller: string;
  beforeAll(async () => {
    await sql()`delete from auth.users where email like ${"%" + DOMAIN}`;
    seller = await member();
  });
  afterAll(async () => {
    await sql()`delete from auth.users where email like ${"%" + DOMAIN}`;
    await closeDb();
  });

  it("opens at the start price and bids for the leader up to their max", async () => {
    const { auctionId } = await auction(seller);
    const [ana, bo] = [await member(), await member()];
    expect(await bid(auctionId, ana, 2500)).toMatchObject({
      ok: true,
      leading: true,
      currentPriceCents: 100,
    });
    expect(await bid(auctionId, bo, 1000)).toMatchObject({
      ok: true,
      leading: false,
      currentPriceCents: 1100,
    });
    expect(await auctionRow(auctionId)).toMatchObject({
      high_bidder_id: ana,
      high_max_cents: 2500,
      bid_count: 2,
    });
    expect(await bidStanding(auctionId, ana)).toEqual({
      hasBid: true,
      leading: true,
      myMaxCents: 2500,
    });
    expect(await bidStanding(auctionId, bo)).toEqual({
      hasBid: true,
      leading: false,
      myMaxCents: 1000,
    });
  });

  it("refuses bids under the minimum, after the end, and on cancelled auctions", async () => {
    const { auctionId, listingId } = await auction(seller, { start: 500 });
    const bidder = await member();
    expect(await bid(auctionId, bidder, 400)).toEqual({
      ok: false,
      reason: "too-low",
      minimumCents: 500,
    });
    const ended = await auction(seller, { minutes: 1 });
    expect(
      await bid(ended.auctionId, bidder, 500, new Date(ended.endsAt.getTime() + 1000)),
    ).toEqual({
      ok: false,
      reason: "ended",
    });
    await cancelOpenAuction(listingId);
    expect(await bid(auctionId, bidder, 900)).toEqual({ ok: false, reason: "ended" });
  });

  it("never lets a seller bid on their own item, or accounts sharing their card or device", async () => {
    const { auctionId } = await auction(seller);
    expect(await bid(auctionId, seller, 500)).toEqual({ ok: false, reason: "own-item" });

    const sameCard = await member();
    await sql()`insert into public.user_cards (user_id, payment_method_id, fingerprint, brand, last4, exp_month, exp_year, is_default)
      values (${seller}, ${"pm_" + randomUUID()}, 'fp_shared', 'visa', '4242', 12, 2030, true),
             (${sameCard}, ${"pm_" + randomUUID()}, 'fp_shared', 'visa', '4242', 12, 2030, true)`;
    expect(await bid(auctionId, sameCard, 500)).toEqual({ ok: false, reason: "linked-to-seller" });

    const sameDevice = await member();
    await sql()`insert into public.user_devices (user_id, device_hash)
      values (${seller}, 'device-x'), (${sameDevice}, 'device-x')`;
    expect(await bid(auctionId, sameDevice, 500)).toEqual({
      ok: false,
      reason: "linked-to-seller",
    });

    // Bidding from the seller's device, even on a fresh account, is refused too.
    const fresh = await member();
    expect(
      await placeBid({ auctionId, bidderId: fresh, maxCents: 500, deviceHash: "device-x" }),
    ).toEqual({
      ok: false,
      reason: "linked-to-seller",
    });
    expect(await bid(auctionId, fresh, 500)).toMatchObject({ ok: true });
  });

  it("extends the end to 2 minutes after a bid in the final 2 minutes", async () => {
    const { auctionId, endsAt } = await auction(seller, { minutes: 10 });
    const bidder = await member();
    const late = new Date(endsAt.getTime() - 30_000);
    const result = await bid(auctionId, bidder, 300, late);
    expect(result).toMatchObject({ ok: true, extended: true });
    expect((await auctionRow(auctionId)).ends_at.getTime()).toBe(late.getTime() + 120_000);

    const early = await auction(seller, { minutes: 10 });
    expect(await bid(early.auctionId, bidder, 300)).toMatchObject({ ok: true, extended: false });
  });

  it("rate-limits bids per member", async () => {
    const bidder = await member();
    const auctions = await Promise.all(Array.from({ length: 7 }, () => auction(seller)));
    const results = [];
    for (const a of auctions) results.push(await bid(a.auctionId, bidder, 200));
    expect(results.slice(0, 6).every((r) => r.ok)).toBe(true);
    expect(results[6]).toEqual({ ok: false, reason: "rate-limited" });
  });

  it("serializes simultaneous bids: only one leads, nothing is lost", async () => {
    const { auctionId } = await auction(seller);
    const bidders = await Promise.all(Array.from({ length: 25 }, () => member()));
    // Distinct maxes from $10 to $250, fired all at once.
    const maxes = bidders.map((_, i) => 1000 + ((i * 37) % 25) * 1000);
    const results = await Promise.all(bidders.map((b, i) => bid(auctionId, b, maxes[i]!)));

    const accepted = results.filter((r) => r.ok);
    const top = Math.max(...maxes);
    const winner = bidders[maxes.indexOf(top)]!;
    const row = await auctionRow(auctionId);
    const [{ n } = { n: 0 }] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.bids where auction_id = ${auctionId}`;

    expect(row.high_bidder_id).toBe(winner);
    expect(row.high_max_cents).toBe(top);
    expect(row.bid_count).toBe(accepted.length);
    expect(n).toBe(accepted.length);
    // Second-highest is $240; the leader pays one $5 increment over it.
    expect(row.current_price_cents).toBe(24500);
    // Bids that arrived after the price passed them were refused as too low, never double-led.
    for (const r of results) if (!r.ok) expect(r.reason).toBe("too-low");
  });
});
