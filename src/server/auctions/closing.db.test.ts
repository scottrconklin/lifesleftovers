import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getSql } from "@/db/client";
import { addDays } from "@/lib/time";
import { closeAuction } from "./closing";
import { placeBid, syncAuctionForListing } from "./service";
import { toggleWant } from "./want";

// Integration: needs `pnpm db:start && pnpm db:migrate && pnpm db:seed` (Houston must exist).
// Events and broadcasts are recorded instead of sent.
const sent = vi.hoisted(() => ({ events: [] as Array<{ name: string; data: unknown }> }));
vi.mock("@/inngest/client", () => ({
  inngest: {
    send: async (e: { name: string; data: unknown }) => {
      sent.events.push(e);
    },
  },
}));
vi.mock("@/server/realtime/broadcast", () => ({ broadcastAuctionClosed: async () => {} }));

const DOMAIN = "@closing.db-test.local";
/** A Sunday far from any real night, so slot tests start from slot 0. */
const TEST_NIGHT = "2031-01-05";
const sql = () => getSql();
const past = () => new Date(Date.now() - 1000);

async function member(phone?: string): Promise<string> {
  const id = randomUUID();
  await sql()`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${id + DOMAIN}, now(), now())`;
  await sql()`insert into public.users (id, display_name, phone_e164) values (${id}, 'Test', ${phone ?? null})`;
  return id;
}

let metroId = "";

/** A live listing with an open auction ending in `minutes` (on today's date). */
async function auction(
  sellerId: string,
  opts: {
    minutes?: number;
    free?: boolean;
    unsoldAction?: "relist_once" | "drop_to_free" | "end";
    unsoldRuns?: number;
  } = {},
) {
  const listingId = randomUUID();
  const auctionId = randomUUID();
  const endsAt = new Date(Date.now() + (opts.minutes ?? 60) * 60_000);
  const start = opts.free ? 0 : 500;
  const [{ today } = { today: "" }] = await sql()<{ today: string }[]>`
    select (now() at time zone 'America/Chicago')::date::text as today`;
  await sql()`
    insert into public.listings (id, seller_id, status, title, category, condition, pickup_zip,
      metro_id, is_free, start_price_cents, closing_night_date, posted_at, unsold_action,
      unsold_runs)
    values (${listingId}, ${sellerId}, 'live', 'Test lamp', 'home-kitchen', 'good', '77494',
      ${metroId}, ${Boolean(opts.free)}, ${start}, ${today}, now(),
      ${opts.unsoldAction ?? "relist_once"}, ${opts.unsoldRuns ?? 0})`;
  await sql()`
    insert into public.auctions (id, listing_id, metro_id, closing_night_date, is_free,
      start_price_cents, current_price_cents, ends_at, scheduled_ends_at)
    values (${auctionId}, ${listingId}, ${metroId}, ${today}, ${Boolean(opts.free)}, ${start},
      ${start}, ${endsAt}, ${endsAt})`;
  return { listingId, auctionId, today };
}

async function endNow(auctionId: string) {
  await sql()`update public.auctions set ends_at = ${past()} where id = ${auctionId}`;
}

async function listingRow(id: string) {
  const [row] = await sql()<
    {
      status: string;
      unsold_runs: number;
      second_chance: boolean;
      needs_decision: boolean;
      is_free: boolean;
      start_price_cents: number;
      closing_night_date: string;
    }[]
  >`select status, unsold_runs, second_chance, needs_decision, is_free, start_price_cents,
      closing_night_date::text as closing_night_date
    from public.listings where id = ${id}`;
  return row!;
}

async function openAuctionFor(listingId: string) {
  const [row] = await sql()<
    {
      id: string;
      is_free: boolean;
      start_price_cents: number;
      closing_night_date: string;
      slot: number;
    }[]
  >`select id, is_free, start_price_cents, closing_night_date::text as closing_night_date, slot
    from public.auctions where listing_id = ${listingId} and status = 'open'`;
  return row;
}

async function cleanUp() {
  await sql()`
    delete from public.orders where seller_id in
      (select id from auth.users where email like ${"%" + DOMAIN})`;
  await sql()`delete from auth.users where email like ${"%" + DOMAIN}`;
  // Nights only these tests created (no auctions left on them).
  await sql()`
    delete from public.closing_nights n
    where not exists (select 1 from public.auctions a where a.closing_night_id = n.id)`;
}

describe("closing auctions (database)", () => {
  let seller: string;
  beforeAll(async () => {
    const [m] = await sql()<{ id: string }[]>`select id from public.metros where slug = 'houston'`;
    metroId = m!.id;
    await cleanUp();
    seller = await member();
  });
  beforeEach(() => {
    sent.events.length = 0;
  });
  afterAll(async () => {
    await cleanUp();
    await closeDb();
  });

  it("won't close before ends_at, including after a soft-close extension", async () => {
    const { auctionId } = await auction(seller, { minutes: 1 });
    const ana = await member();
    const bid = await placeBid({ auctionId, bidderId: ana, maxCents: 900, deviceHash: null });
    expect(bid).toMatchObject({ ok: true, extended: true });
    // The original end has passed; the extension hasn't.
    const result = await closeAuction(auctionId, new Date(Date.now() + 61_000));
    expect(result.kind).toBe("not-yet");
  });

  it("sells to the high bidder at the current price plus the buyer's premium", async () => {
    const { auctionId, listingId } = await auction(seller);
    const [ana, bo] = [await member(), await member()];
    await placeBid({ auctionId, bidderId: ana, maxCents: 2000, deviceHash: null });
    await placeBid({ auctionId, bidderId: bo, maxCents: 1200, deviceHash: null });
    await endNow(auctionId);

    const result = await closeAuction(auctionId);
    expect(result).toMatchObject({ kind: "sold", buyerId: ana, priceCents: 1300, via: "bid" });
    const [order] = await sql()<
      {
        kind: string;
        status: string;
        price_cents: number;
        premium_cents: number;
        total_cents: number;
        buyer_id: string;
      }[]
    >`select kind, status, price_cents, premium_cents, total_cents, buyer_id
      from public.orders where auction_id = ${auctionId}`;
    expect(order).toEqual({
      kind: "sale",
      status: "awaiting_payment",
      price_cents: 1300,
      premium_cents: 130,
      total_cents: 1430,
      buyer_id: ana,
    });
    expect((await listingRow(listingId)).status).toBe("sold");
    expect(sent.events.map((e) => e.name)).toEqual(["order/created"]);
  });

  it("is idempotent: ten simultaneous closes make one order", async () => {
    const { auctionId } = await auction(seller);
    const ana = await member();
    await placeBid({ auctionId, bidderId: ana, maxCents: 700, deviceHash: null });
    await endNow(auctionId);

    const results = await Promise.all(Array.from({ length: 10 }, () => closeAuction(auctionId)));
    expect(results.filter((r) => r.kind === "sold")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "already-closed")).toHaveLength(9);
    const [{ n } = { n: 0 }] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.orders where auction_id = ${auctionId}`;
    expect(n).toBe(1);
    expect(sent.events.filter((e) => e.name === "order/created")).toHaveLength(1);
    // And again later: still one.
    expect((await closeAuction(auctionId)).kind).toBe("already-closed");
  });

  it("ends bidding at the close", async () => {
    const { auctionId } = await auction(seller);
    await endNow(auctionId);
    await closeAuction(auctionId);
    const late = await placeBid({
      auctionId,
      bidderId: await member(),
      maxCents: 900,
      deviceHash: null,
    });
    expect(late).toEqual({ ok: false, reason: "ended" });
  });

  it("free item, no bids: draws a winner from the 'I want it' taps", async () => {
    const { auctionId, listingId } = await auction(seller, { free: true });
    const wanters = [await member(), await member(), await member()];
    for (const w of wanters)
      expect(await toggleWant(auctionId, w)).toMatchObject({ ok: true, wanted: true });
    // Tap twice to leave the draw.
    const quitter = await member();
    await toggleWant(auctionId, quitter);
    expect(await toggleWant(auctionId, quitter)).toEqual({ ok: true, wanted: false, count: 3 });
    expect(await toggleWant(auctionId, seller)).toEqual({ ok: false, reason: "own-item" });
    await endNow(auctionId);

    const result = await closeAuction(auctionId);
    expect(result).toMatchObject({ kind: "sold", via: "draw", priceCents: 0 });
    if (result.kind !== "sold") throw new Error("unreachable");
    expect(wanters).toContain(result.buyerId);
    const [order] = await sql()<{ kind: string; status: string; total_cents: number }[]>`
      select kind, status, total_cents from public.orders where auction_id = ${auctionId}`;
    expect(order).toEqual({ kind: "free_claim", status: "claimed", total_cents: 0 });
    expect((await listingRow(listingId)).status).toBe("sold");
    expect(await toggleWant(auctionId, await member())).toEqual({ ok: false, reason: "closed" });
  });

  it("free item with a bid: the highest bid wins, no draw and no premium", async () => {
    const { auctionId } = await auction(seller, { free: true });
    const [tapper, bidder] = [await member(), await member()];
    await toggleWant(auctionId, tapper);
    await placeBid({ auctionId, bidderId: bidder, maxCents: 300, deviceHash: null });
    await endNow(auctionId);
    expect(await closeAuction(auctionId)).toMatchObject({
      kind: "sold",
      buyerId: bidder,
      via: "bid",
    });
    const [order] = await sql()<{ price_cents: number; premium_cents: number }[]>`
      select price_cents, premium_cents from public.orders where auction_id = ${auctionId}`;
    expect(order).toEqual({ price_cents: 100, premium_cents: 0 });
  });

  it("the draw is fair: every tapper wins sometimes", async () => {
    const wanters = [await member(), await member(), await member()];
    const wins = new Map(wanters.map((w) => [w, 0]));
    for (let i = 0; i < 30; i++) {
      const { auctionId } = await auction(seller, { free: true });
      for (const w of wanters) await toggleWant(auctionId, w);
      await endNow(auctionId);
      const r = await closeAuction(auctionId);
      if (r.kind === "sold") wins.set(r.buyerId, (wins.get(r.buyerId) ?? 0) + 1);
    }
    // 30 draws among 3: each wins at least once except with probability ~3 × (2/3)^30 ≈ 0.002%.
    expect([...wins.values()].every((n) => n > 0)).toBe(true);
  });

  it("unsold, relist once: back next week as a Second Chance, then asks the seller", async () => {
    const { auctionId, listingId, today } = await auction(seller);
    await endNow(auctionId);
    const first = await closeAuction(auctionId);
    expect(first).toMatchObject({ kind: "unsold", next: "relisted" });

    const listing = await listingRow(listingId);
    expect(listing).toMatchObject({
      status: "live",
      unsold_runs: 1,
      second_chance: true,
      needs_decision: false,
      closing_night_date: addDays(today, 7),
    });
    const relist = await openAuctionFor(listingId);
    expect(relist).toMatchObject({ closing_night_date: addDays(today, 7), is_free: false });
    expect(sent.events).toEqual([
      expect.objectContaining({ name: "auction/scheduled", data: { auctionId: relist!.id } }),
    ]);

    // Unsold again: no third run; the seller decides.
    await endNow(relist!.id);
    expect(await closeAuction(relist!.id)).toMatchObject({
      kind: "unsold",
      next: "needs-decision",
    });
    expect(await listingRow(listingId)).toMatchObject({
      status: "ended",
      unsold_runs: 2,
      needs_decision: true,
    });
    expect(await openAuctionFor(listingId)).toBeUndefined();
  });

  it("unsold, drop to free: relists next week at $0", async () => {
    const { auctionId, listingId } = await auction(seller, { unsoldAction: "drop_to_free" });
    await endNow(auctionId);
    await closeAuction(auctionId);
    expect(await listingRow(listingId)).toMatchObject({
      status: "live",
      is_free: true,
      start_price_cents: 0,
      second_chance: true,
    });
    expect(await openAuctionFor(listingId)).toMatchObject({ is_free: true, start_price_cents: 0 });
  });

  it("unsold, just end it: the listing ends without asking", async () => {
    const { auctionId, listingId } = await auction(seller, { unsoldAction: "end" });
    await endNow(auctionId);
    expect(await closeAuction(auctionId)).toMatchObject({ kind: "unsold", next: "ended" });
    expect(await listingRow(listingId)).toMatchObject({ status: "ended", needs_decision: false });
  });

  it("gives listings joining a night one-minute slots in order", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const listingId = randomUUID();
      await sql()`
        insert into public.listings (id, seller_id, status, title, category, condition,
          pickup_zip, metro_id, start_price_cents, closing_night_date, posted_at)
        values (${listingId}, ${seller}, 'live', 'Slot test', 'home-kitchen', 'good', '77494',
          ${metroId}, 100, ${TEST_NIGHT}, now())`;
      await syncAuctionForListing(listingId);
      ids.push(listingId);
    }
    const rows = await sql()<{ slot: number; ends_at: Date }[]>`
      select slot, ends_at from public.auctions
      where listing_id in ${sql()(ids)} order by slot`;
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    // Sunday Jan 5, 2031, 7:00 PM Central (UTC-6) and the next two minutes.
    expect(rows.map((r) => r.ends_at.toISOString())).toEqual([
      "2031-01-06T01:00:00.000Z",
      "2031-01-06T01:01:00.000Z",
      "2031-01-06T01:02:00.000Z",
    ]);

    // Editing before any bids keeps the slot.
    await syncAuctionForListing(ids[0]!);
    const [kept] = await sql()<{ slot: number }[]>`
      select slot from public.auctions where listing_id = ${ids[0]!} and status = 'open'`;
    expect(kept?.slot).toBe(0);
    expect(sent.events.filter((e) => e.name === "auction/scheduled")).toHaveLength(3);
  });
});
